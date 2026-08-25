import time
import urllib.request
import os

print("--- STARTING NETWORK SPEED BENCHMARK ---")

# 1. Download Test (50 MB from Fast CDN)
print("1. Testing Download Speed...")
try:
    t0 = time.time()
    url = "https://proof.ovh.net/files/100Mb.dat" # 12.5 MB file
    tmp_file = "/tmp/speedtest_down.tmp"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp, open(tmp_file, 'wb') as f:
        f.write(resp.read())
    file_size_mb = os.path.getsize(tmp_file) / (1024 * 1024)
    down_dur = time.time() - t0
    down_mbps = (file_size_mb * 8) / down_dur
    if os.path.exists(tmp_file):
        os.remove(tmp_file)
    print(f"-> DOWNLOAD SPEED: {down_mbps:.2f} Mbps (Duration: {down_dur:.2f}s, Size: {file_size_mb:.2f} MB)")
except Exception as e:
    down_mbps = 0
    print("Download test error:", e)

# 2. Upload Test (10 MB to Speed Endpoint)
print("2. Testing Upload Speed...")
try:
    data = os.urandom(10000000) # 10 MB payload
    t0 = time.time()
    req = urllib.request.Request("https://httpbin.org/post", data=data, method="POST", headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/octet-stream'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()
    up_dur = time.time() - t0
    up_mbps = (10 * 8) / up_dur
    print(f"-> UPLOAD SPEED: {up_mbps:.2f} Mbps (Duration: {up_dur:.2f}s)")
except Exception as e:
    up_mbps = 0
    print("Upload test error:", e)

print("--- BENCHMARK COMPLETE ---")
print(f"FINAL RESULT => Download: {down_mbps:.2f} Mbps | Upload: {up_mbps:.2f} Mbps")
