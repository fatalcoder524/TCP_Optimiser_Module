import { exec, toast, moduleInfo } from './kernelsu.js';
import router_state from './router.js';
import { addLog } from './logs.js';

async function readModuleProp () {
	try {
		const { stdout: details } = await exec(`cat /data/adb/modules/tcp_optimiser/module.prop`);
		const lines = details.trim().split('\n').filter(line => line);
		
		// Convert lines to object
		let moduleInfo = lines.reduce((acc, line) => {
		  const [key, ...rest] = line.split('=');
		  const value = rest.join('=').trim(); // handle values with '=' in them
		  acc[key.trim()] = value;
		  return acc;
		}, {});
		
		moduleInfo["moduleDir"] = `/data/adb/modules/${moduleInfo.id}`;
		return moduleInfo;
	} catch (error) {
		
	}
}

export async function updateModuleInformation () {
	try {
		router_state.moduleInformation = JSON.parse(moduleInfo());
		if(router_state.moduleInformation != {}) {
			router_state.moduleInformation = await readModuleProp();
		}
	}catch (error) {
		console.error('Error updating module info:', error);
		toast("Error fetching module info.");
	}
	var versionStr = router_state.moduleInformation.version ? 'v' + router_state.moduleInformation.version : '';
	var versionCodeStr = router_state.moduleInformation.versionCode ? router_state.moduleInformation.versionCode : '';
	var finalVersionStr = versionStr != '' && versionCodeStr != '' ? `${versionStr} (${versionCodeStr})` : "module.prop might be corrupted!"
	document.getElementById('version').textContent = finalVersionStr;
}

export async function getModuleActiveState () {
	try {
		const { stdout: file_exists } = await exec(`su -c 'ls /dev/.tcp_module_log_cleared'`);
		return file_exists != "" ? true: false;
	}catch (error) {
		console.error('Error updating module state:', error);
		toast("Error fetching module state.");
	}
}

export async function get_active_iface () {
	try {
		const { stdout: active_iface } = await exec(`ip route get 192.0.2.1 2>/dev/null | awk '/dev/ {for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}'`);
		return active_iface.trim()
	} catch (error) {
		console.error('Error fetching active interface: ', error);
		addLog('Error fetching active interface.');
		toast("Error fetching active interface.");
		return "error"
	}
};

export async function get_active_algorithm () {
	try {
		const { stdout: active_algo } = await exec(`su -c "cat /proc/sys/net/ipv4/tcp_congestion_control"`);
		return active_algo.trim()
	} catch (error) {
		console.error('Error fetching active interface: ', error);
		addLog('Error fetching active interface.');
		toast("Error fetching active interface.");
		return "error"
	}
};

export async function getInitcwndInitrwndValue () {
	try {
		const { stdout: initcwndInitrwndValueOutput } = await exec(`ip route show | grep -o 'initcwnd [0-9]* initrwnd [0-9]*'`);
		const initcwndInitrwndValues = initcwndInitrwndValueOutput.trim().split(/\s+/).filter((_, i) => i % 2 === 1);
		return initcwndInitrwndValues;
	} catch (error) {
		console.error('Error fetching active interface: ', error);
		addLog('Error fetching active interface.');
		toast("Error fetching active interface.");
		return [];
	}
};

export async function get_wifi_calling_state() {
  const DUMPSYS_TMP_FILE = `${router_state.moduleInformation.moduleDir}/dumpsys.tmp`;

  try {
    // Run dumpsys and save to file
    await exec(`su -c 'dumpsys activity service SystemUIService > "${DUMPSYS_TMP_FILE}" 2>/dev/null'`);

    // Check for VoWiFi pattern
     const { stdout: returnCode } = await exec(`
      grep -qE "slot=\'vowifi\'.*visible user=.*" "${DUMPSYS_TMP_FILE}" && echo $?`
    );

    // Clean up temp file
    await exec(`rm -f "${DUMPSYS_TMP_FILE}"`);

    // Return true if match found (exit code 0)
    return returnCode.trim() === '0';
  } catch (error) {
    console.error('Error checking VoWiFi state:', error);
	addLog('Error checking VoWiFi state.');
    return false;
  }
}

export async function fetchIsConfigFile (file_name) {
	try {
		const { stdout: output } = await exec(`[ -f "${router_state.moduleInformation.moduleDir}/${file_name}" ] && echo "exist" || echo ""`);
		return output == "exist";
	} catch (error) {
		console.error('Error fetching kill connections status: ', error);
		addLog('Error fetching kill connections status.');
		toast("Error fetching kill connections status.");
		return false;
	}
};

export function formatLocalDateTime(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, '0');

  const yyyy = date.getFullYear();
  const mm   = pad(date.getMonth() + 1);
  const dd   = pad(date.getDate());

  const hh   = pad(date.getHours());
  const min  = pad(date.getMinutes());
  const ss   = pad(date.getSeconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

document.addEventListener('DOMContentLoaded', async () => {
	document.querySelectorAll('.link').forEach(async (link) => {
		link.addEventListener('click', async (event) => {
			event.preventDefault();
			const url = event.currentTarget.getAttribute('data-value');
			await exec(`am start -a android.intent.action.VIEW -d "${url}"`);
		});
	});
});
