import requests, time
s = requests.Session()
s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
data = s.get('http://192.168.18.2:7575/api/gallery/data').json()
videos = data.get('videos', [])
print('Found', len(videos), 'videos')
for v in videos:
    vid_id = v.get('id')
    title = v.get('title')
    t0 = time.time()
    h = {'Range': 'bytes=0-1048575'}
    res = s.get(f'http://192.168.18.2:7575/stream/{vid_id}', headers=h)
    t1 = time.time()
    print(f'Testing video: {title}')
    print(f'   -> Status: {res.status_code}, Length: {len(res.content)} bytes, Time: {round((t1-t0)*1000, 2)} ms')
    print(f'   -> Range: {res.headers.get("Content-Range")}, Type: {res.headers.get("Content-Type")}')
