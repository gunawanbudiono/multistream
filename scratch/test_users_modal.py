import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

r_users = s.get('http://192.168.18.2:7575/users')
print('2. GET /users STATUS CODE:', r_users.status_code == 200)

# Check for category filter buttons
has_filters = all(k in r_users.text for k in ['logFilterAll', 'logFilterAuth', 'logFilterStream', 'logFilterMedia', 'logFilterAdmin'])
print('3. LOG CATEGORY FILTER PILLS PRESENT:', has_filters)

# Check for parseDbDate helper in users page
print('4. PARSE_DB_DATE HELPER PRESENT:', 'parseDbDate' in r_users.text)

# Check inspector endpoint
admin_id = 'bdb0aa84-e0ce-4c04-a0d0-7e44bc6eef35'
insp_res = s.get(f'http://192.168.18.2:7575/api/users/{admin_id}/inspector')
insp_data = insp_res.json()
print('5. INSPECTOR LOGS LOADED:', len(insp_data.get('logs', [])) > 0)
if len(insp_data.get('logs', [])) > 0:
    print(f"   -> Top log: {insp_data['logs'][0].get('description')}")
