1. Support all rmnet and ccmni interfaces as Cellular.
2. Add support for bbr3 detection during installation.
3. Add support for qdisc configuration.
4. Add initrwnd value capping.
5. Optimize sysctl parameters for low latency and high throughput.
6. Switched from heavy binary `date +s` to internal timer.
7. Add initcwnd and initrwnd support for IPv6.
8. Use better parsing for get_active_iface.
9. Wrap curly braces around variable name so busybox ash.
10. Fine-tune qdisc parameters for common qdisc.
11. Fix module.prop corruption and handle description reset in a better way.
