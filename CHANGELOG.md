1. Fix multiq total_bands detection.
2. Update service.sh timings to prevent some race conditions. [OnePlus devices]
3. Create post-fs-data.d directory if it doesn't exist.
4. Add support for local tc binary which supports all qdics.
5. Fix qdisc reset in following cases:
   - Toggle Airplane Mode.
   - Toggle WiFi / Cellular.
6. Add qdisc monitor to prevent netd from changing qdisc.
7. Simplify fq_codel leaf queue for htb.
8. Add bbr3 detection in post-fs stage.
9. Enable full screen mode to prevent navigation bar from interfering.
10. Add pfifo_head_drop, pie, fq_pie and cake full support.
11. Optimize sysctl parameters for low latency, high throughput and stability.
12. Add newly introduced PLB sysctl param support for optimisations.
13. Reduce initrwnd max value to 20 based on RFC 6928.
14. Set tcp_mem dynamically.

Note:
1. More qdisc tuning will be added in next version when I get more information from many users.
2. qdisc fine-tuning currently doesn't support custom mode. Might be added in future.
3. If your kernel supports bbr3, then please use fq / cake / fq_pie for best results.
4. Some kernels convert bbrv1 to bbrv3 and keep the name as bbr. Even in that case use fq / cake / fq_pie instead of other qdisc.
