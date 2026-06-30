import { exec, toast } from './kernelsu.js';
import router_state from './router.js';
import { addLog } from './logs.js';
import { fetchIsConfigFile } from './common.js';

async function getSelectedQdisc(prefix) {
	try {
		const { stdout: rawFile } = await exec(`ls ${router_state.moduleInformation.moduleDir}/${prefix}_* 2>/dev/null | xargs -n 1 basename | head -n1`);
		const fileName = rawFile.trim();
		if (!fileName) return "fifo";
		const stripInterface = fileName.replace(`${prefix}_`, '');
		const qdisc = stripInterface.substring(stripInterface.indexOf('_') + 1);
		switch(prefix)
		{
			case "wlan":
				router_state.settingsPageParams.wlanQdisc = qdisc.trim();
				return router_state.settingsPageParams.wlanQdisc;
				break;
			
			case "rmnet_data":
				router_state.settingsPageParams.rmnetQdisc = qdisc.trim();
				return router_state.settingsPageParams.rmnetQdisc;
				break;
		}
	} catch (error) {
		console.error('Error fetching qdiscs:', error);
		addLog('Error fetching queuing discipline');
		toast("Error fetching queuing discipline.");
		return null;
	}
}

async function getSelectedAlgorithm(prefix) {
	try {
		const { stdout: rawFile } = await exec(`ls ${router_state.moduleInformation.moduleDir}/${prefix}_* 2>/dev/null | xargs -n 1 basename | head -n1`);
		const fileName = rawFile.trim();
		if (!fileName) return "fifo";
		const stripInterface = fileName.replace(`${prefix}_`, '');
		const algo = stripInterface.substring(0, stripInterface.indexOf('_'));
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
		console.error('Error fetching algorithm:', error);
		addLog('Error fetching congestion control algorithm');
		toast("Error fetching congestion control algorithm.");
		return null;
	}
}

async function checkAndGetPrefixValueExists(prefix, type) {
	switch(prefix)
	{
		case "wlan":
			switch(type)
			{
				case "algo":
					return router_state.settingsPageParams.wlanAlgo == null ? await getSelectedAlgorithm(prefix): router_state.settingsPageParams.wlanAlgo;
					break;
				case "qdisc":
					return router_state.settingsPageParams.wlanQdisc == null ? await getSelectedQdisc(prefix): router_state.settingsPageParams.wlanQdisc;
					break;
			}
		break;
		
		case "rmnet_data":
			switch(type)
			{
				case "algo":
					return router_state.settingsPageParams.rmnetAlgo == null ? await getSelectedAlgorithm(prefix): router_state.settingsPageParams.rmnetAlgo;
					break;
				case "qdisc":
					return router_state.settingsPageParams.rmnetQdisc == null ? await getSelectedQdisc(prefix): router_state.settingsPageParams.rmnetQdisc;
					break;
			}
			break;
	}
}

async function populateDropdown(dropdown, options, prefix, type) {
	dropdown.innerHTML = '';

	var value = await checkAndGetPrefixValueExists(prefix, type);
	var valueExists = false;
  
	options.forEach(option => {
		const optionElement = document.createElement('option');
		optionElement.textContent = optionElement.value = option;
		dropdown.appendChild(optionElement);
		valueExists = (value == option) ? true: valueExists;
	});

	switch(type)
	{
		case "algo":
			dropdown.value = valueExists ? value : "cubic";
			break;
		case "qdisc":
			dropdown.value = valueExists ? value : "fifo";
			break;
	}
}

const fetchAvailableAlgorithms = async (force = false) => {
	try {
		if(router_state.available_algorithms.length == 0 || force)
		{
			const { stdout: output } = await exec('cat /proc/sys/net/ipv4/tcp_available_congestion_control');
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

const fetchAvailableQdiscs = async (force = false) => {
	try {
		if (router_state.available_qdiscs.length === 0 || force) {
			const { stdout: output } = await exec('zcat /proc/config.gz | grep "CONFIG_NET_SCH_"');
			if (output) {
				const qdiscs = [];
				output.split('\n').forEach(line => {
					const match = line.match(/^CONFIG_NET_SCH_([A-Z0-9_]+)=y$/);
					if (match) {
						const qdiscName = match[1];
						if (qdiscName !== "INGRESS" && qdiscName !== "NETEM")
						{
							if(qdiscName === "FIFO")
							{
								qdiscs.push("pfifo");
								qdiscs.push("bfifo");
								qdiscs.push("pfifo_head_drop");
							}
							else
							{
								qdiscs.push(qdiscName.toLowerCase());
							}
						}
					}
				});

				if (!qdiscs.includes("pfifo_fast")) {
					qdiscs.push("pfifo_fast");
				}
				router_state.available_qdiscs = qdiscs;
			} else {
				addLog('Failed to fetch queuing disciplines');
				toast("No queuing disciplines found.");
			}
		}
		
	} catch (error) {
		console.error('Error fetching queuing disciplines:', error);
		addLog('Error fetching queuing disciplines');
		toast("Error fetching queuing disciplines.");
	}
};

export async function initSettings() {
	const wifiAlgo = document.getElementById('wifi-algo');
	const wifiQdisc = document.getElementById('wifi-qdisc');
	const cellularAlgo = document.getElementById('cellular-algo');
	const cellularQdisc = document.getElementById('cellular-qdisc');
	const killConnections = document.getElementById('kill-connections');
	const initcwndInitrwnd = document.getElementById('initcwnd-initrwnd');
	const applyBtn = document.getElementById('apply');
	const forceApplyBtn = document.getElementById('force-apply');
	
	if(router_state.available_algorithms.length == 0)
		await fetchAvailableAlgorithms();
	
	if(router_state.available_qdiscs.length == 0)
		await fetchAvailableQdiscs();
	
	if(router_state.settingsPageParams.killConnections == null)
		router_state.settingsPageParams.killConnections = await fetchIsConfigFile("kill_connections");
	
	if(router_state.settingsPageParams.initcwndInitrwnd == null)
		router_state.settingsPageParams.initcwndInitrwnd = await fetchIsConfigFile("initcwnd_initrwnd");
	
	await populateDropdown(wifiAlgo, router_state.available_algorithms, "wlan", "algo");
	await populateDropdown(wifiQdisc, router_state.available_qdiscs, "wlan", "qdisc");
	await populateDropdown(cellularAlgo, router_state.available_algorithms, "rmnet_data", "algo");
	await populateDropdown(cellularQdisc, router_state.available_qdiscs, "rmnet_data", "qdisc");
	killConnections.checked =  router_state.settingsPageParams.killConnections;
	initcwndInitrwnd.checked = router_state.settingsPageParams.initcwndInitrwnd;

	async function applySettings() {
		const settings = {
			wifiAlgorithm: wifiAlgo.value,
			wifiQdisc: wifiQdisc.value,
			cellularAlgorithm: cellularAlgo.value,
			cellularQdisc: cellularQdisc.value,
			killOnChange: killConnections.checked,
			setInitcwndInitrwndOnChange: initcwndInitrwnd.checked,
		};
		
		try
		{
			await exec(`rm -f ${router_state.moduleInformation.moduleDir}/wlan_*`);
			await exec(`rm -f ${router_state.moduleInformation.moduleDir}/rmnet_data_*`);
			await exec(`rm -f ${router_state.moduleInformation.moduleDir}/kill_connections`);
			await exec(`rm -f ${router_state.moduleInformation.moduleDir}/initcwnd_initrwnd`);
			
			await exec(`touch ${router_state.moduleInformation.moduleDir}/wlan_${settings.wifiAlgorithm}_${settings.wifiQdisc} && chmod 644 ${router_state.moduleInformation.moduleDir}/wlan_${settings.wifiAlgorithm}_${settings.wifiQdisc}`);
			await exec(`touch ${router_state.moduleInformation.moduleDir}/rmnet_data_${settings.cellularAlgorithm}_${settings.cellularQdisc} && chmod 644 ${router_state.moduleInformation.moduleDir}/rmnet_data_${settings.cellularAlgorithm}_${settings.cellularQdisc}`);
			if(settings.killOnChange)
				await exec(`touch ${router_state.moduleInformation.moduleDir}/kill_connections && chmod 644 ${router_state.moduleInformation.moduleDir}/kill_connections`);

			if(settings.setInitcwndInitrwndOnChange)
				await exec(`touch ${router_state.moduleInformation.moduleDir}/initcwnd_initrwnd && chmod 644 ${router_state.moduleInformation.moduleDir}/initcwnd_initrwnd`);

			console.log('Applied settings:', settings);
			
			router_state.settingsPageParams.wifiAlgo = settings.wifiAlgorithm;
			router_state.settingsPageParams.wlanQdisc = settings.wifiQdisc;
			router_state.settingsPageParams.rmnetAlgo = settings.cellularAlgorithm;
			router_state.settingsPageParams.rmnetQdisc = settings.cellularQdisc;
			router_state.settingsPageParams.killConnections = settings.killOnChange;
			router_state.settingsPageParams.initcwndInitrwnd = settings.setInitcwndInitrwndOnChange;
			toast("Settings Applied Successfully!");
			addLog(`Applying settings: WiFi=${settings.wifiAlgorithm}, WiFi_qdisc=${settings.wifiQdisc}, Cellular=${settings.cellularAlgorithm}, Cellular_qdisc=${settings.cellularQdisc}, Kill=${settings.killOnChange}, initcwnd_initrwnd=${settings.setInitcwndInitrwndOnChange}`);
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
			const { errno: output } = await exec(`touch ${router_state.moduleInformation.moduleDir}/force_apply && chmod 644 ${router_state.moduleInformation.moduleDir}/force_apply`);
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
