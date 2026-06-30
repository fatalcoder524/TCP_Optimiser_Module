#!/system/bin/sh

MODPATH="${0%/*}"
DEBOUNCE_TIME=5
VOWIFI_CONNECT_TIME=20

. $MODPATH/utils.sh # Load utils

# Get the list of available congestion control algorithms
congestion_algorithms=$(cat /proc/sys/net/ipv4/tcp_available_congestion_control)

CURRENT_ALGO=""
CURRENT_QDISC=""

update_description() {
	local iface="$1"
	local icon="⁉️"

	case "$iface" in
		Wi-Fi) icon="🛜" ;;
		Cellular) icon="📶" ;;
	esac

	local desc="TCP Optimisations \& update tcp_cong_algo based on interface \| iface\: $iface $icon \| algo\: $CURRENT_ALGO \| qdisc\: $CURRENT_QDISC"
	sed -i -e "s/^description=.*/description=$desc/" "$MODPATH/module.prop"
}

kill_tcp_connections() {
	if [ -f "$MODPATH/kill_connections" ]; then
		log_print "Killing all TCP connections (IPv4 and IPv6) due to congestion change"
		
		# Kill all connections
		ss -K
	fi
}

set_max_initcwnd_initrwnd() {
	local active_iface="$1"
	if [ -f "$MODPATH/initcwnd_initrwnd" ]; then
		maxBufferSize=$(cat /proc/sys/net/ipv4/tcp_rmem | awk '{print $3}')
		maxBufferSize=${maxBufferSize:-16777216}
		mtu=$(ip link show "$active_iface" | awk '/mtu/ {print $NF}')
		mtu=${mtu:-1500}
		mtu=$((mtu - 40))
		maxInitrwndValue=$((maxBufferSize / mtu))
		if [ "$maxInitrwndValue" -gt 64 ]; then
			maxInitrwndValue=64
		fi
		local applied
		applied=0

		while IFS= read -r line; do
			[ -z "$line" ] && continue
			run_as_su "/system/bin/ip route change $line initcwnd 10 initrwnd $maxInitrwndValue"
			[ $? -eq 0 ] && applied=1
		done <<EOF
$(run_as_su "/system/bin/ip route show | grep \"dev $active_iface\"")
EOF

		while IFS= read -r line; do
			[ -z "$line" ] && continue
			run_as_su "/system/bin/ip -6 route change $line initcwnd 10 initrwnd $maxInitrwndValue"
			[ $? -eq 0 ] && applied=1
		done <<EOF
$(run_as_su "/system/bin/ip -6 route show | grep \"dev $active_iface\"")
EOF

		if [ "$applied" -eq 1 ]; then
			log_print "Setting initcwnd = 10; initrwnd = $maxInitrwndValue!"
		fi
	fi
}

set_qdisc() {
	local iface="$1"
	local qdisc="$2"
	local mode="$3"

	local qdisc_args="$qdisc"
	local handle_flag=""

	if [ "$qdisc" = "fq" ]; then
		qdisc_args="fq pacing limit 2000 flow_limit 40 buckets 1024 initial_quantum 15000"
	elif [ "$qdisc" = "fq_codel" ]; then
		qdisc_args="fq_codel limit 1024 target 5ms interval 100ms ecn"
	elif [ "$qdisc" = "htb" ]; then
		handle_flag="handle 1:"
		qdisc_args="htb default 1 r2q 10"
	elif [ "$qdisc" = "sfq" ]; then
		qdisc_args="sfq"
	elif [ "$qdisc" = "multiq" ]; then
		qdisc_args="multiq"
	elif [ "$qdisc" = "tbf" ]; then
		qdisc_args="tbf rate 1000mbit burst 100kb latency 50ms"
	elif [ "$qdisc" = "prio" ]; then
		handle_flag="handle 1:"
		qdisc_args="prio bands 3"
	elif [ "$qdisc" = "pfifo" ]; then
		qdisc_args="pfifo limit 2000"
	elif [ "$qdisc" = "bfifo" ]; then
		qdisc_args="bfifo limit 3145728"
	elif [ "$qdisc" = "pfifo_fast" ]; then
		qdisc_args="pfifo_fast"
	elif [ "$qdisc" = "cake" ]; then
		qdisc_args="cake besteffort triple-isolate wash"
	elif [ "$qdisc" = "pie" ]; then
		qdisc_args="pie target 5ms ecn"
	fi

	if run_as_su "tc qdisc replace dev $iface root $handle_flag $qdisc_args"; then
		log_print "Applied qdisc: $qdisc ($iface)"

		if [ "$qdisc" = "htb" ]; then
			run_as_su "tc class add dev $iface parent 1: classid 1:1 htb rate 1000mbit ceil 1000mbit" 2>/dev/null
			run_as_su "tc qdisc add dev $iface parent 1:1 handle 10: fq_codel limit 1024 target 5ms interval 100ms ecn" 2>/dev/null
			
			log_print " [+] Attached low-latency fq_codel leaf to HTB root on $iface"
		elif [ "$qdisc" = "multiq" ]; then
			local qdisc_show=$(su -c "tc qdisc show dev $iface | grep multiq")
			local root_handle=$(echo "$qdisc_show" | awk '{print $3}')
			local total_bands=$(echo "$qdisc_show" | grep -o "bands [^ ]*" | awk '{print $2}' | cut -d'/' -f1)
			
			root_handle=${root_handle:-"1:"}
			total_bands=${total_bands:-4}
			
			log_print " [~] Configuring $total_bands bands on parent $root_handle dynamically..."

			local i=1
			while [ "$i" -le "$total_bands" ]; do
				local hex_id=$(printf "%x" "$i")
				run_as_su "tc qdisc add dev $iface parent ${root_handle}${hex_id} handle $((i + 10)): fq_codel limit 1024 target 5ms interval 100ms ecn" 2>/dev/null
				i=$((i + 1))
			done

			log_print " [+] Fully optimized multiq hardware lanes on $iface"
		elif [ "$qdisc" = "prio" ]; then
			local b=1
			while [ "$b" -le 3 ]; do
				run_as_su "tc qdisc add dev $iface parent 1:$b handle $((b + 20)): fq_codel limit 1024 target 5ms interval 100ms ecn" 2>/dev/null
				b=$((b + 1))
			done
			log_print " [+] Attached low-latency fq_codel leaves to all prio bands on $iface"
		fi

		CURRENT_QDISC=$qdisc
		update_description "$mode"
	else
		log_print "Failed to apply qdisc: $qdisc ($iface)"
	fi
}

set_congestion() {
	local algo="$1"
	local mode="$2"
	if echo "$congestion_algorithms" | grep -qw "$algo"; then
		echo "$algo" > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null
		log_print "Applied congestion control: $algo ($mode)"
		kill_tcp_connections
		CURRENT_ALGO=$algo
		update_description "$mode"
	else
		log_print "Unavailable algorithm: $algo"
	fi
}

set_tcp_pacing() {
	local ca="$1"
	local ss="$2"
	echo "$ca" > /proc/sys/net/ipv4/tcp_pacing_ca_ratio 2>/dev/null
	echo "$ss" > /proc/sys/net/ipv4/tcp_pacing_ss_ratio 2>/dev/null
}

get_active_iface() {
	iface=$(ip route get 192.0.2.1 2>/dev/null | grep -o "dev [^ ]*" | awk '{print $2}')
	echo "$iface"
}

get_wifi_freq() {
	local iface="$1"
	iw dev "$iface" link 2>/dev/null | grep "freq:" | awk '{print $2}'
}

apply_wifi_settings() {
	local iface="$1"
	local applied=0
	freq=$(get_wifi_freq "$iface")
	log_print "Wi-Fi band detected: ${freq} MHz"
	if [ -n "$freq" ]; then
		if [ "$freq" -lt 3000 ]; then
			# 2.4 GHz
			set_tcp_pacing 150 200
		elif [ "$freq" -lt 6000 ]; then
			# 5 GHz or higher
			set_tcp_pacing 200 300
		else
			# 6 GHz or higher
			set_tcp_pacing 250 350
		fi
	fi
	
	for algo in $congestion_algorithms; do
		for filepath in "$MODPATH/wlan_${algo}_"*; do
			if [ -f "$filepath" ]; then
				set_congestion "$algo" "Wi-Fi"
				
				local filename="${filepath##*/}"
				local qdisc="${filename#wlan_${algo}_}"
				set_qdisc "$iface" "$qdisc" "Wi-Fi"

				set_max_initcwnd_initrwnd "$iface"
				applied=1
				break 2
			fi
		done
	done
	[ "$applied" -eq 0 ] && set_congestion cubic "Wi-Fi" && set_max_initcwnd_initrwnd "$iface"
	return $applied
}

apply_cellular_settings() {
	local iface="$1"
	local applied=0
	
	set_tcp_pacing 120 200
	
	for algo in $congestion_algorithms; do
		for filepath in "$MODPATH/rmnet_data_${algo}_"*; do
			if [ -f "$filepath" ]; then
				set_congestion "$algo" "Cellular"

				local filename="${filepath##*/}"
				local qdisc="${filename#rmnet_data_${algo}_}"
				set_qdisc "$iface" "$qdisc" "Cellular"

				set_max_initcwnd_initrwnd "$iface"
				applied=1
				break 2
			fi
		done
	done
	[ "$applied" -eq 0 ] && set_congestion cubic "Cellular" && set_max_initcwnd_initrwnd "$iface"
	return $applied
}

# Start Run Code

# IPv4 TCP optimizations
echo 1 > /proc/sys/net/ipv4/tcp_ecn 2>/dev/null
echo "fq_codel" > /proc/sys/net/core/default_qdisc 2>/dev/null
echo 120 > /proc/sys/net/ipv4/tcp_pacing_ca_ratio 2>/dev/null
echo 180 > /proc/sys/net/ipv4/tcp_pacing_ss_ratio 2>/dev/null
echo 1 > /proc/sys/net/ipv4/tcp_window_scaling 2>/dev/null
echo "4096 2097152 16777216" > /proc/sys/net/ipv4/tcp_rmem 2>/dev/null
echo "4096 2097152 16777216" > /proc/sys/net/ipv4/tcp_wmem 2>/dev/null
echo 16777216 > /proc/sys/net/core/rmem_max 2>/dev/null
echo 16777216 > /proc/sys/net/core/wmem_max 2>/dev/null
echo 4096 > /proc/sys/net/ipv4/tcp_max_syn_backlog 2>/dev/null
echo 0 > /proc/sys/net/ipv4/tcp_mtu_probing 2>/dev/null

# IPv6 TCP tuning
echo 1 > /proc/sys/net/ipv6/tcp_ecn 2>/dev/null
echo "4096 2097152 16777216" > /proc/sys/net/ipv6/tcp_rmem 2>/dev/null
echo "4096 2097152 16777216" > /proc/sys/net/ipv6/tcp_wmem 2>/dev/null

# Extra settings for optimal stability
echo 100000 > /proc/sys/net/core/netdev_max_backlog 2>/dev/null
echo 3 > /proc/sys/net/ipv4/tcp_fastopen 2>/dev/null
echo 917504 > /proc/sys/net/core/rmem_default 2>/dev/null
echo 917504 > /proc/sys/net/core/wmem_default 2>/dev/null

# High-Yield Network Jitter & Continuity Tweaks
echo 0 > /proc/sys/net/ipv4/tcp_slow_start_after_idle 2>/dev/null
echo 1 > /proc/sys/net/ipv4/tcp_no_metrics_save 2>/dev/null
echo 204800 > /proc/sys/net/core/optmem_max 2>/dev/null
echo "524288 786432 1048576" > /proc/sys/net/ipv4/tcp_mem 2>/dev/null

last_mode=""
change_time=0
vowifi_pending=0
vowifi_start_time=0

resetprop -w sys.boot_completed 0

until [ -d "/sdcard/Android/data" ]; do sleep 1; done
sleep 20
current_time=0

while true; do
	iface=$(get_active_iface)
	if [ -z "$iface" ]; then
		sleep 5
		current_time=$((current_time + 5))
		continue
	fi

	new_mode="none"
	case "$iface" in
		wlan*|tun*) new_mode="Wi-Fi" ;;
		*rmnet*|*ccmni*) new_mode="Cellular" ;;
		*) new_mode="none" ;;
	esac

	if [ "$new_mode" != "$last_mode" ] || [ -f "$MODPATH/force_apply" ]; then
		if [ "$((current_time - change_time))" -ge "$DEBOUNCE_TIME" ]; then
			applied=0
			if [ "$new_mode" = "Wi-Fi" ]; then
				# Start waiting for VoWiFi
				vowifi_pending=1
				vowifi_start_time="$current_time"
			elif [ "$new_mode" = "Cellular" ]; then
				vowifi_pending=0
				apply_cellular_settings "$iface"
			fi
			last_mode="$new_mode"
			change_time="$current_time"
			rm -f "$MODPATH/force_apply"
		fi
	fi
	
	# === Wi-Fi Pending Logic ===
	if [ "$new_mode" = "Wi-Fi" ] && [ "$vowifi_pending" -eq 1 ]; then
		vowifi=$(get_wifi_calling_state)
		vowifi=${vowifi:-1}
		if [ "$((current_time - vowifi_start_time))" -ge "$VOWIFI_CONNECT_TIME" ]; then
			log_print "[INFO] VoWiFi timeout reached. Applying Wi-Fi settings..."
			vowifi_pending=0
			apply_wifi_settings "$iface"
		elif [ "$vowifi" -eq 0 ]; then
			log_print "[INFO] VoWiFi activated. Applying Wi-Fi settings..."
			vowifi_pending=0
			apply_wifi_settings "$iface"
		fi
	fi

	sleep 5
	current_time=$((current_time + 5))
done
