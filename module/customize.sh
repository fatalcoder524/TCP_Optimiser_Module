#!/system/bin/sh

ui_print " [+] Starting module customization..."

# Detect congestion algorithm
ui_print " [+] Checking TCP congestion algorithm..."
AVAIL_CC="$(cat /proc/sys/net/ipv4/tcp_available_congestion_control)"
ui_print " Available CC: $AVAIL_CC"

if echo "$AVAIL_CC" | grep -qw bbr3; then
    CONG="bbr3"
    ui_print " [+] Found BBR3!"
elif echo "$AVAIL_CC" | grep -qw bbr; then
    CONG="bbr"
    ui_print " [+] Found BBR!"
else
    CONG="cubic"
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
    local target="$MODPATH/${prefix}_${suffix}"

    if check_exists_anywhere "$prefix"; then
        # If file exists and KSU is true, copy any file from MODULEPATH with the same prefix
        if [ "$KSU" = true ]; then
            # Find any file starting with ${prefix}_ in MODULEPATH and copy it to MODPATH
            source_file=$(find "$MODULE_PATH" -name "${prefix}_*" -print -quit)
            if [ -n "$source_file" ]; then
                cp "$source_file" "$MODPATH/"
                
                file_name=$(basename "$source_file")
                ui_print " [+] Copied from $MODULE_PATH to $MODPATH: $file_name"
            fi
        else
            ui_print " [-] Skipping $target: file already exists."
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
create_file_if_needed "wlan" "$CONG"

# Always create rmnet_data_cubic unless another exists
create_file_if_needed "rmnet_data" "cubic"

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
