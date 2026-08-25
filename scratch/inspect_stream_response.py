import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print("Login status:", login_res.status_code, login_res.url)

vid_id = '0169960d-a63d-499b-be14-565d28b76096'
res = s.get(f'http://192.168.18.2:7575/stream/{vid_id}', headers={'Range': 'bytes=0-16777215'})
print("Stream status:", res.status_code)
print("Headers:", dict(res.headers))
print("Content snippet (first 100 bytes):", res.content[:100])
