import { exec, toast } from './kernelsu.js';
import { get_active_iface, get_active_algorithm, getInitcwndInitrwndValue, get_wifi_calling_state, getModuleActiveState } from './common.js';
import router_state from './router.js';

export async function updateModuleStatus () {
	var module_status = "Loading Module Status...⌛";
	var active_iface = "None";
	var active_iface_type = "Unknown ⁉️";
	var active_algorithm = "Unknown ⁉️";
	var wifi_calling_state = "Unknown ⁉️";
	var active_InitcwndInitrwndValue = [];
	try
	{
		module_status = (await getModuleActiveState()) == true ? "Enabled ✅" : "Disabled ❌";
		active_iface = await get_active_iface();
		active_iface = active_iface ? active_iface : "None";
		active_iface_type = active_iface.startsWith("rmnet") || active_iface.startsWith("ccmni") ? "Cellular 📶" : active_iface.startsWith("wlan") || active_iface.startsWith("tun") ? "Wi-Fi 🛜" : "Unknown ⁉️";
		active_algorithm = await get_active_algorithm();
		active_InitcwndInitrwndValue = await getInitcwndInitrwndValue();
		if(active_iface_type == "Wi-Fi 🛜")
		{
			wifi_calling_state = await get_wifi_calling_state() ? "Active ": "Inactive ";
		}
	} catch (error) {
		console.error('Error updating status: ', error);
		addLog('Error updating status.');
		toast("Error updating status.");
	} finally {
		router_state.homePageParams.module_status = module_status;
		router_state.homePageParams.active_iface_type = active_iface_type;
		router_state.homePageParams.active_iface = active_iface;
		router_state.homePageParams.active_algorithm = active_algorithm;
		router_state.homePageParams.active_InitcwndInitrwndValue = active_InitcwndInitrwndValue;
		router_state.homePageParams.wifi_calling_state = wifi_calling_state;
	}
}

export function updateHomeUI () {
	if (router_state.isInitializing == false) {
		document.getElementById('module_status_value').textContent = router_state.homePageParams.module_status;
		if(router_state.homePageParams.module_status == "Enabled ✅")
		{
			const ifaceTypeDiv = document.getElementById('active_iface_type_div');
			const ifaceValDiv = document.getElementById('active_iface_div');
			const tcpCongValDiv = document.getElementById('tcp_cong_div');
			
			document.getElementById('active_iface_type_value').textContent = router_state.homePageParams.active_iface_type;
			document.getElementById('active_iface_value').textContent = router_state.homePageParams.active_iface;
			document.getElementById('tcp_cong_value').textContent = router_state.homePageParams.active_algorithm;
			
			if (ifaceTypeDiv?.classList.contains('hidden'))
					ifaceTypeDiv.classList.remove('hidden');
			
			if (ifaceValDiv?.classList.contains('hidden'))
					ifaceValDiv.classList.remove('hidden');
			
			if (tcpCongValDiv?.classList.contains('hidden'))
					tcpCongValDiv.classList.remove('hidden');
			
			const wifiCallingDiv = document.getElementById('wifi_calling_value_div');
			const wifiCallingSpan = document.getElementById('wifi_calling_value');
			
			if(router_state.homePageParams.active_iface_type == "Wi-Fi 🛜")
			{
				if (wifiCallingDiv?.classList.contains('hidden'))
					wifiCallingDiv.classList.remove('hidden');
				
				wifiCallingSpan.textContent = router_state.homePageParams.wifi_calling_state;
			}
			else
			{
				if (wifiCallingDiv.classList.contains('hidden'))
					wifiCallingDiv.classList.add('hidden');
				wifiCallingSpan.textContent = "Unknown ⁉️";
			}
			
			const initcwndDiv = document.getElementById('initcwnd_value_div');
			const initrwndDiv = document.getElementById('initrwnd_value_div');
			const initcwndSpan = document.getElementById('initcwnd_value');
			const initrwndSpan = document.getElementById('initrwnd_value');
			
			const values = router_state.homePageParams.active_InitcwndInitrwndValue;
			const isLoading = values.length < 2 && router_state.settingsPageParams.initcwndInitrwnd;
			
			if(values.length == 2 || isLoading)
			{
				if (initcwndDiv?.classList.contains('hidden'))
					initcwndDiv.classList.remove('hidden');
				
				if (initrwndDiv?.classList.contains('hidden'))
					initrwndDiv.classList.remove('hidden');
				
				initcwndSpan.textContent = values.length == 2 ? values[0] : "Loading initcwnd value...";
				initrwndSpan.textContent = values.length == 2 ? values[1] : "Loading initrwnd value...";
			}
			else
			{
				// No data and not loading → hide the section
				if (initcwndDiv && !initcwndDiv.classList.contains('hidden'))
					initcwndDiv.classList.add('hidden');
				
				if (initrwndDiv && !initrwndDiv.classList.contains('hidden'))
					initrwndDiv.classList.add('hidden');
			}
		}
	}
}

export async function initHome() {
	router_state.isInitializing = false;
	updateHomeUI();
}
