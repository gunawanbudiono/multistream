import requests, time

s = requests.Session()
s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})

vid_id = '0169960d-a63d-499b-be14-565d28b76096' # Uci David
t0 = time.time()
res = s.get(f'http://192.168.18.2:7575/stream/{vid_id}', headers={'Range': 'bytes=0-16777215'}, stream=True)
chunk = next(res.iter_content(chunk_size=1024*1024))
t1 = time.time()

print(f"Status: {res.status_code}")
print(f"Content-Range: {res.headers.get('Content-Range')}")
print(f"Content-Length: {res.headers.get('Content-Length')}")
print(f"First 1MB received in: {round((t1-t0)*1000, 2)} ms")
