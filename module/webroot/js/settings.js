import { exec, toast } from './kernelsu.js';
import router_state from './router.js';
import { addLog } from './logs.js';
import { fetchIsConfigFile } from './common.js';

async function getSelectedAlgorithm(prefix) {
	try {
		const { stdout: algo } = await exec(`su -c "ls ${router_state.moduleInformation.moduleDir}/${prefix}_* 2>/dev/null | xargs -n 1 basename | head -n1 | awk -F_ '{print $NF}'"`);
		switch(prefix)
		{
			case "wlan":
				router_state.settingsPageParams.wlanAlgo = algo.trim();
				return router_state.settingsPageParams.wlanAlgo;
				break;
			
			case "rmnet_data":
				router_state.settingsPageParams.rmnetAlgo = algo.trim();
				return router_state.settingsPageParams.rmnetAlgo;
				break;
		}
	} catch (error) {
		console.error('Error fetching algorithms:', error);
		addLog('Error fetching congestion control algorithms');
		toast("Error fetching congestion control algorithms.");
		return null;
	}
}

async function checkAndGetPrefixValueExists(prefix) {
	switch(prefix)
	{
		case "wlan":
			return router_state.settingsPageParams.wlanAlgo == null ? await getSelectedAlgorithm(prefix): router_state.settingsPageParams.wlanAlgo;
			break;
		
		case "rmnet_data":
			return router_state.settingsPageParams.rmnetAlgo == null ? await getSelectedAlgorithm(prefix): router_state.settingsPageParams.rmnetAlgo;
			break;
	}
}

async function populateDropdown(dropdown, options, prefix) {
	dropdown.innerHTML = '';
	var algorithm = await checkAndGetPrefixValueExists(prefix);
	var algorithmExists = false;
  
	options.forEach(option => {
		const optionElement = document.createElement('option');
		optionElement.textContent = optionElement.value = option;
		dropdown.appendChild(optionElement);
		algorithmExists = (algorithm == option) ? true: algorithmExists;
	});

	dropdown.value = algorithmExists ? algorithm : "cubic";
}

const fetchAvailableAlgorithms = async (force = false) => {
	try {
		if(router_state.available_algorithms.length == 0 || force)
		{
			const { stdout: output } = await exec('su -c cat /proc/sys/net/ipv4/tcp_available_congestion_control');
			if (output) {
				// Split by whitespace and convert each into an object
				router_state.available_algorithms = output.trim().split(/\s+/).map(algo => algo);
			} else {
				addLog('Failed to fetch congestion control algorithms');
				toast("No congestion control algorithms found.");
			}
		}
		
	} catch (error) {
		console.error('Error fetching algorithms:', error);
		addLog('Error fetching congestion control algorithms');
		toast("Error fetching congestion control algorithms.");
	}
};

export async function initSettings() {
	const wifiAlgo = document.getElementById('wifi-algo');
	const cellularAlgo = document.getElementById('cellular-algo');
	const killConnections = document.getElementById('kill-connections');
	const initcwndInitrwnd = document.getElementById('initcwnd-initrwnd');
	const applyBtn = document.getElementById('apply');
	const forceApplyBtn = document.getElementById('force-apply');
	
	if(router_state.available_algorithms.length == 0)
		await fetchAvailableAlgorithms();
	
	if(router_state.settingsPageParams.killConnections == null)
		router_state.settingsPageParams.killConnections = await fetchIsConfigFile("kill_connections");
	
	if(router_state.settingsPageParams.initcwndInitrwnd == null)
		router_state.settingsPageParams.initcwndInitrwnd = await fetchIsConfigFile("initcwnd_initrwnd");
	
	await populateDropdown(wifiAlgo, router_state.available_algorithms, "wlan");
	await populateDropdown(cellularAlgo, router_state.available_algorithms, "rmnet_data");
	killConnections.checked =  router_state.settingsPageParams.killConnections;
	initcwndInitrwnd.checked = router_state.settingsPageParams.initcwndInitrwnd;

	async function applySettings() {
		const settings = {
			wifiAlgorithm: wifiAlgo.value,
			cellularAlgorithm: cellularAlgo.value,
			killOnChange: killConnections.checked,
			setInitcwndInitrwndOnChange: initcwndInitrwnd.checked,
		};
		
		try
		{
			await exec(`su -c rm -f ${router_state.moduleInformation.moduleDir}/wlan_*`);
			await exec(`su -c rm -f ${router_state.moduleInformation.moduleDir}/rmnet_data_*`);
			await exec(`su -c rm -f ${router_state.moduleInformation.moduleDir}/kill_connections`);
			await exec(`su -c rm -f ${router_state.moduleInformation.moduleDir}/initcwnd_initrwnd`);
			
			await exec(`su -c touch ${router_state.moduleInformation.moduleDir}/wlan_${settings.wifiAlgorithm} && chmod 644 ${router_state.moduleInformation.moduleDir}/wlan_${settings.wifiAlgorithm}`);
			await exec(`su -c touch ${router_state.moduleInformation.moduleDir}/rmnet_data_${settings.cellularAlgorithm} && chmod 644 ${router_state.moduleInformation.moduleDir}/rmnet_data_${settings.cellularAlgorithm}`);
			if(settings.killOnChange)
				await exec(`su -c "touch ${router_state.moduleInformation.moduleDir}/kill_connections && chmod 644 ${router_state.moduleInformation.moduleDir}/kill_connections"`);

			if(settings.setInitcwndInitrwndOnChange)
				await exec(`su -c "touch ${router_state.moduleInformation.moduleDir}/initcwnd_initrwnd && chmod 644 ${router_state.moduleInformation.moduleDir}/initcwnd_initrwnd"`);

			console.log('Applied settings:', settings);
			
			router_state.settingsPageParams.wifiAlgo = settings.wifiAlgorithm;
			router_state.settingsPageParams.rmnetAlgo = settings.cellularAlgorithm;
			router_state.settingsPageParams.killConnections = settings.killOnChange;
			router_state.settingsPageParams.initcwndInitrwnd = settings.setInitcwndInitrwndOnChange;
			toast("Settings Applied Successfully!");
			addLog(`Applying settings: WiFi=${settings.wifiAlgorithm}, Cellular=${settings.cellularAlgorithm}, Kill=${settings.killOnChange}, initcwnd_initrwnd=${settings.setInitcwndInitrwndOnChange}`);
			return 0;
		} catch (error) {
			console.error('Error applying settings:', error);
			toast("Error applying settings.");
			return 1;
		}
	}

	applyBtn.addEventListener('click', async () => {
		var res = await applySettings();
		if(res == 0)
			toast("Turn off and on connection to apply settings.");
	});
	
	forceApplyBtn.addEventListener('click', async () => {
		var res = await applySettings();
		if(res == 0)
		{
			const { errno: output } = await exec(`su -c "touch ${router_state.moduleInformation.moduleDir}/force_apply && chmod 644 ${router_state.moduleInformation.moduleDir}/force_apply"`);
			if(output == 0)
				toast("Wait for 5s to reflect changes!");
		}
	});
	
	
	document.querySelectorAll('.collapsible-header').forEach(header => {
	  const content = header.nextElementSibling;
	  const arrow = header.querySelector('.arrow');

	  // Set initial state
	  content.classList.add('collapsed');
	  // header.classList.add('active'); // Optional: open first by default

	  header.addEventListener('click', () => {
		const isCollapsed = content.classList.contains('collapsed');
		
		// Toggle collapsed state
		if (isCollapsed) {
		  content.style.maxHeight = content.scrollHeight + "px";
		  header.classList.add('active');
		} else {
		  content.style.maxHeight = "0";
		  header.classList.remove('active');
		}

		content.classList.toggle('collapsed');
		arrow.classList.toggle('rotated');
	  });
	});
	
	router_state.isInitializing = false;
}
