#!/system/bin/sh

MODPATH="${0%/*}"
LOGFILE="$MODPATH/service.log"
FLAGFILE="/dev/.tcp_module_log_cleared"
MAX_LOG_LINES=200
DUMPSYS_TMP_FILE="$MODPATH/dumpsys.tmp"

# Clear log on first run after boot
if [ ! -f "$FLAGFILE" ]; then
    rm -f "$LOGFILE" >/dev/null 2>&1
    touch "$FLAGFILE" >/dev/null 2>&1
fi

log_print() {
	message="$1"

	timestamp=$(date +'%Y-%m-%d %H:%M:%S')
	echo "$timestamp - $message" >> "$LOGFILE"

	line_count=$(wc -l < "$LOGFILE" 2>/dev/null)
	if [ "$line_count" -gt "$MAX_LOG_LINES" ]; then
		tail -n "$((MAX_LOG_LINES / 2))" "$LOGFILE" > "${LOGFILE}.tmp"
		mv "${LOGFILE}.tmp" "$LOGFILE"
	fi
}

run_as_su() {
	local cmd="$*"
	su -c "$cmd"
	local status=$?
	return $status
}

run_tc() {
	"$MODPATH/bin/tc" "$@"
	return $?
}

get_wifi_calling_state() {
	rm -f "$DUMPSYS_TMP_FILE"
	dumpsys activity service SystemUIService > "$DUMPSYS_TMP_FILE" 2>/dev/null
	grep -qEm 1 "slot='vowifi'.*visible user=.*" "$DUMPSYS_TMP_FILE"
	local status=$?
	rm -f "$DUMPSYS_TMP_FILE"
	# echo's result: 0 = true (VoWiFi active), 1 = false
	echo $status
}