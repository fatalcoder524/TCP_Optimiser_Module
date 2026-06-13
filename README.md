# TCP_Optimiser_Module
A Magisk/KernelSU module to change tcp congestion algorithm based on current active internet type and some network enhancements.

# Why?
In certain kernel, TCP Congestion Algorithm BBR might be enabled. Or you want to enable certain algorithm or settings based on what interface you are using. I observed that in my kernel, when i use BBR with WiFi I get 50-60 Mbps more upload speed compared to cubic, but BBR gives bad upload speed in cellular. So I designed this module to switch based on active internet facing interface.

# Features
1. Set TCP Congestion Algorithm based on interface(Wi-Fi/Cellular).
2. Auto Change TCP Congestion Algorithm on interface change.
3. Set initcwnd and initrwnd value to max.

# How to use
1. Install the module.
2. It creates 2 files `wlan_{algo}_{qdisc}` and `rmnet_data_{algo}_{qdisc}` in module folder.
3. Reboot device.
4. Basic Functionality of module must run normally on boot.

# Tuning Module by files [/data/adb/modules/tcp_optimiser]
1. TCP Congestion Algorithm can be changed for given interface by editing `{algo}` part of file name. `wlan_{algo}_{qdisc}` for Wi-Fi and `rmnet_data_{algo}_qdisc` for Cellular.
2. Queuing Disciplines can be changed for given interface by editing `{qdisc}` part of file name. `wlan_{algo}_{qdisc}` for Wi-Fi and `rmnet_data_{algo}_qdisc` for Cellular.
3. Create an empty file named `initcwnd_initrwnd` to set initcwnd and initrwnd value to max values.
4. Create an empty file named `kill_connections` to kill all connections during switch. [Be carefull!]
5. Create an empty file named `force_apply` to apply changes immediately.

# Tuning Module by WebUI
All the module settings can be controlled using Module WebUI in KSU and APatch or KsuWebUIStandalone app for Magisk.

## Note:
1. `{algo}` in filename can be any TCP congestion algorithm (cubic, bbr, reno etc..). 
2. `{qdisc}` in filename can be any Queuing Disciplines (fq, fq_codel, pfifo_fast etc..). 
3. Default algorithm is **cubic** for **cellular**.
4. Default algorithm is **bbr** if exists for **WiFi**. Else **cubic**.
5. There is an option to kill current tcp connections during algorithm change. This will stop downloads, uploads or other ongoing connections. So apps affected might need to be restarted. This is disabled by default.
6. Algorithm is applied only if present in kernel.
7. Module logs are present in `/data/adb/modules/tcp_optimiser/service.log`.
