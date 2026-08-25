import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

admin_id = 'bdb0aa84-e0ce-4c04-a0d0-7e44bc6eef35'
insp_res = s.get(f'http://192.168.18.2:7575/api/users/{admin_id}/inspector')
insp_data = insp_res.json()
logs = insp_data.get('logs', [])
print(f'2. ADMIN LOGS COUNT: {len(logs)}')
if len(logs) > 0:
    for i, l in enumerate(logs[:3]):
        print(f"   [{i+1}] {l.get('category').upper()}: {l.get('description')} ({l.get('created_at')})")

time_res = s.get('http://192.168.18.2:7575/api/server-time').json()
print(f"3. SERVER TIME (WIB): {time_res.get('formattedTime')}")
