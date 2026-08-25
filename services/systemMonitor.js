const si = require('systeminformation');
const { exec } = require('child_process');

let previousNetworkData = null;
let previousTimestamp = null;

async function getGpuUsage() {
  return new Promise((resolve) => {
    exec('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', { timeout: 1500 }, (err, stdout) => {
      if (!err && stdout) {
        const parts = stdout.trim().split(',').map(s => s.trim());
        if (parts.length >= 1) {
          const usage = parseInt(parts[0]) || 0;
          const memUsed = parseInt(parts[1]) || 0;
          const memTotal = parseInt(parts[2]) || 0;
          return resolve({
            usage: usage,
            memUsed: memUsed,
            memTotal: memTotal
          });
        }
      }
      si.graphics().then((g) => {
        if (g && g.controllers && g.controllers.length > 0) {
          const c = g.controllers.find(ctrl => ctrl.utilizationGpu !== undefined) || g.controllers[0];
          return resolve({
            usage: Math.round(c.utilizationGpu || (c.memoryUsed && c.memoryTotal ? (c.memoryUsed / c.memoryTotal) * 100 : 0)),
            memUsed: c.memoryUsed || 0,
            memTotal: c.memoryTotal || 0
          });
        }
        resolve({ usage: 0, memUsed: 0, memTotal: 0 });
      }).catch(() => {
        resolve({ usage: 0, memUsed: 0, memTotal: 0 });
      });
    });
  });
}

async function getSystemStats() {
  try {
    const [cpuData, gpuData, memData, networkData, diskData] = await Promise.all([
      si.currentLoad(),
      getGpuUsage(),
      si.mem(),
      si.networkStats(),
      getDiskUsage()
    ]);
    
    const cpuUsage = cpuData.currentLoad || cpuData.avg || 0;
    
    const networkSpeed = calculateNetworkSpeed(networkData);
    
    const formatMemory = (bytes) => {
      if (bytes >= 1073741824) {
        return (bytes / 1073741824).toFixed(2) + " GB";
      } else {
        return (bytes / 1048576).toFixed(2) + " MB";
      }
    };
    
    return {
      cpu: {
        usage: Math.round(cpuUsage),
        cores: cpuData.cpus ? cpuData.cpus.length : 0
      },
      gpu: gpuData,
      memory: {
        total: formatMemory(memData.total),
        used: formatMemory(memData.active),
        free: formatMemory(memData.available),
        usagePercent: Math.round((memData.active / memData.total) * 100)
      },
      network: networkSpeed,
      disk: diskData,
      platform: process.platform,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error getting system stats:', error);
    return {
      cpu: { usage: 0, cores: 0 },
      gpu: { usage: 0, memUsed: 0, memTotal: 0 },
      memory: { total: "0 GB", used: "0 GB", free: "0 GB", usagePercent: 0 },
      network: { download: 0, upload: 0, downloadFormatted: '0 Kbps', uploadFormatted: '0 Kbps' },
      disk: { total: "0 GB", used: "0 GB", free: "0 GB", usagePercent: 0, drive: "N/A" },
      platform: process.platform,
      timestamp: Date.now()
    };
  }
}

function calculateNetworkSpeed(networkData) {
  const currentTimestamp = Date.now();
  
  if (!previousNetworkData || !previousTimestamp) {
    previousNetworkData = networkData;
    previousTimestamp = currentTimestamp;
    return {
      download: 0,
      upload: 0,
      downloadFormatted: '0 Mbps',
      uploadFormatted: '0 Mbps'
    };
  }
  
  const timeDiff = (currentTimestamp - previousTimestamp) / 1000;
  
  const currentTotal = networkData
    .filter(iface => !iface.iface.includes('lo') && !iface.iface.includes('Loopback'))
    .reduce((acc, iface) => ({
      rx_bytes: acc.rx_bytes + (iface.rx_bytes || 0),
      tx_bytes: acc.tx_bytes + (iface.tx_bytes || 0)
    }), { rx_bytes: 0, tx_bytes: 0 });
  
  const previousTotal = previousNetworkData
    .filter(iface => !iface.iface.includes('lo') && !iface.iface.includes('Loopback'))
    .reduce((acc, iface) => ({
      rx_bytes: acc.rx_bytes + (iface.rx_bytes || 0),
      tx_bytes: acc.tx_bytes + (iface.tx_bytes || 0)
    }), { rx_bytes: 0, tx_bytes: 0 });
  
  const downloadBps = Math.max(0, (currentTotal.rx_bytes - previousTotal.rx_bytes) / timeDiff);
  const uploadBps = Math.max(0, (currentTotal.tx_bytes - previousTotal.tx_bytes) / timeDiff);
  
  const downloadMbps = (downloadBps * 8) / (1024 * 1024);
  const uploadMbps = (uploadBps * 8) / (1024 * 1024);
  
  previousNetworkData = networkData;
  previousTimestamp = currentTimestamp;
  
  return {
    download: downloadMbps,
    upload: uploadMbps,
    downloadFormatted: formatSpeed(downloadMbps),
    uploadFormatted: formatSpeed(uploadMbps)
  };
}

function formatSpeed(speedMbps) {
  if (speedMbps >= 1000) {
    return (speedMbps / 1000).toFixed(2) + ' Gbps';
  } else if (speedMbps >= 1) {
    return speedMbps.toFixed(2) + ' Mbps';
  } else {
    return (speedMbps * 1000).toFixed(0) + ' Kbps';
  }
}

async function getDiskUsage() {
  try {
    const fsSize = await si.fsSize();
    const platform = process.platform;
    
    let targetDisk;
    
    if (platform === 'win32') {
      const currentDrive = process.cwd().charAt(0).toUpperCase();
      targetDisk = fsSize.find(disk => disk.mount.charAt(0).toUpperCase() === currentDrive);
      
      if (!targetDisk) {
        targetDisk = fsSize.find(disk => disk.mount.charAt(0).toUpperCase() === 'C');
      }
    } else {
      targetDisk = fsSize.find(disk => disk.mount === '/');
    }
    
    if (!targetDisk) {
      targetDisk = fsSize[0];
    }
    
    if (!targetDisk) {
      return {
        total: "0 GB",
        used: "0 GB", 
        free: "0 GB",
        usagePercent: 0,
        drive: "N/A"
      };
    }
    
    const formatDisk = (bytes) => {
      if (bytes >= 1099511627776) {
        return (bytes / 1099511627776).toFixed(2) + " TB";
      } else if (bytes >= 1073741824) {
        return (bytes / 1073741824).toFixed(2) + " GB";
      } else {
        return (bytes / 1048576).toFixed(2) + " MB";
      }
    };
    
    const usagePercent = targetDisk.size > 0 ? 
      Math.round(((targetDisk.size - targetDisk.available) / targetDisk.size) * 100) : 0;
    
    return {
      total: formatDisk(targetDisk.size),
      used: formatDisk(targetDisk.size - targetDisk.available),
      free: formatDisk(targetDisk.available),
      usagePercent: usagePercent,
      drive: targetDisk.mount || targetDisk.fs || "Unknown"
    };
  } catch (error) {
    console.error('Error getting disk usage:', error);
    return {
      total: "0 GB",
      used: "0 GB",
      free: "0 GB", 
      usagePercent: 0,
      drive: "N/A"
    };
  }
}

module.exports = { getSystemStats };