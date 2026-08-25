import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

r = s.get('http://192.168.18.2:7575/users')
print('2. USERS PAGE 200:', r.status_code == 200)

# Check Inspector trigger in table
print('3. INSPECTOR TRIGGER IN TABLE:', 'openInspectorModal' in r.text)

# Check Inspector Modal in HTML
print('4. INSPECTOR MODAL IN HTML:', 'id="inspectorModal"' in r.text and 'id="tabBtnVideos"' in r.text and 'id="tabBtnStreams"' in r.text)

# Check Inspector API endpoint with a member ID (e.g. music or ngadimin)
music_id = 'b5e49207-e96c-4450-9d0d-32cf4b2d35c5'
api_res = s.get(f'http://192.168.18.2:7575/api/users/{music_id}/inspector')
print('5. INSPECTOR API STATUS 200:', api_res.status_code == 200)
try:
    data = api_res.json()
    print('6. INSPECTOR API JSON VALID:', data.get('success') == True and 'videos' in data and 'streams' in data)
    print('   -> User inspected:', data.get('user', {}).get('username'))
    print('   -> Total videos:', len(data.get('videos', [])))
    print('   -> Total streams:', len(data.get('streams', [])))
except Exception as e:
    print('6. INSPECTOR API JSON ERROR:', e)
