#!/system/bin/sh

ui_print " [+] Starting module customization..."

# Detect congestion algorithm
ui_print " [+] Checking TCP congestion algorithm..."
AVAIL_CC="$(cat /proc/sys/net/ipv4/tcp_available_congestion_control)"
ui_print " Available CC: $AVAIL_CC"

if echo "$AVAIL_CC" | grep -qw bbr3; then
    CONG="bbr3"
    QDISC="fq"
    ui_print " [+] Found BBR3!"
elif echo "$AVAIL_CC" | grep -qw bbr; then
    CONG="bbr"
    QDISC="fq_codel"
    ui_print " [+] Found BBR!"
else
    CONG="cubic"
    QDISC="fq_codel"
    ui_print " [+] BBR/BBR3 not found. Falling back to Cubic!"
fi

MODULE_NAME=$(basename "$MODPATH")
MODULE_PATH="/data/adb/modules/$MODULE_NAME"

# Check both live and update folders
check_exists_anywhere() {
    local prefix="$1"

    # Check in current path
    if ls "$MODPATH"/${prefix}_* >/dev/null 2>&1; then
        return 0
    fi
    
    # Check in Module main path
    if ls "$MODULE_PATH"/${prefix}_* >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

create_file_if_needed() {
    local prefix="$1"
    local suffix="$2"
    local extra="$3"

    local target_name="${prefix}_${suffix}_${extra}"
    local target="$MODPATH/$target_name"

    if check_exists_anywhere "$prefix"; then
        # If file exists and KSU is true, copy any file from MODULEPATH with the same prefix
        if [ "$KSU" = true ]; then
            # Find any file starting with ${prefix}_ in MODULEPATH and copy it to MODPATH
            source_file=$(find "$MODULE_PATH" -name "${prefix}_*" -print -quit)
            if [ -n "$source_file" ]; then
                file_name=$(basename "$source_file")
                cp "$source_file" "$MODPATH/"
                ui_print " [+] Copied from $MODULE_PATH to $MODPATH: $file_name"
                
                local remainder="${file_name#${prefix}_}"
                if [ "$remainder" = "${remainder%_*}" ]; then
                    mv "$MODPATH/$file_name" "$MODPATH/${file_name}_${extra}"
                    ui_print " [~] Renamed single-suffix file to: ${file_name}_${extra}"
                fi
            fi
        else
            ui_print " [-] Skipping $target: file already exists."
            source_file=$(find "$MODULE_PATH" -name "${prefix}_*" -print -quit)
            if [ -n "$source_file" ]; then
                file_name=$(basename "$source_file")
                local remainder="${file_name#${prefix}_}"
                if [ "$remainder" = "${remainder%_*}" ]; then
                    mv "$MODULE_PATH/$file_name" "$MODULE_PATH/${file_name}_${extra}"
                    ui_print " [~] Renamed single-suffix file to: ${file_name}_${extra}"
                fi
            fi
        fi
        return
    fi

    if [ ! -f "$target" ]; then
        touch "$target"
        ui_print " [+] Created: $target"
    else
        ui_print " [-] Skipped: $target already exists"
    fi
}

# Create wlan_* based on BBR availability
create_file_if_needed "wlan" "$CONG" "$QDISC"

# Always create rmnet_data_cubic unless another exists
create_file_if_needed "rmnet_data" "cubic" "fq_codel"

if check_exists_anywhere "kill"; then
    # If file exists and KSU is true, copy any file from MODULEPATH with the same prefix
    if [ "$KSU" = true ]; then
        # Find any file starting with ${prefix}_ in MODULEPATH and copy it to MODPATH
        source_file=$(find "$MODULE_PATH" -name "kill_connections" -print -quit)
        if [ -n "$source_file" ]; then
            cp "$source_file" "$MODPATH/"
            ui_print " [+] Copied from $MODULE_PATH to $MODPATH: kill_connections"
        fi
    else
        ui_print " [-] Skipping $MODPATH/kill_connections: file already exists."
    fi
fi

if check_exists_anywhere "initcwnd"; then
    # If file exists and KSU is true, copy any file from MODULEPATH with the same prefix
    if [ "$KSU" = true ]; then
        # Find any file starting with ${prefix}_ in MODULEPATH and copy it to MODPATH
        source_file=$(find "$MODULE_PATH" -name "initcwnd_initrwnd" -print -quit)
        if [ -n "$source_file" ]; then
            cp "$source_file" "$MODPATH/"
            ui_print " [+] Copied from $MODULE_PATH to $MODPATH: initcwnd_initrwnd"
        fi
    else
        ui_print " [-] Skipping $MODPATH/initcwnd_initrwnd: file already exists."
    fi
fi

cp "$MODPATH/module.prop" "$MODPATH/module.prop.bak"

chmod +x "$MODPATH/bin/tc"

mkdir -p /data/adb/post-fs-data.d
cat << 'EOF' > /data/adb/post-fs-data.d/tcp_optimiser.sh
#!/system/bin/sh
MODDIR=/data/adb/modules/tcp_optimiser
cp "$MODDIR/module.prop.bak" "$MODDIR/module.prop"
EOF
chmod +x /data/adb/post-fs-data.d/tcp_optimiser.sh
