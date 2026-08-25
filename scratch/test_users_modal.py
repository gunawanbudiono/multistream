import requests
from datetime import datetime

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

# Check Server Time endpoint
time_res = s.get('http://192.168.18.2:7575/api/server-time')
time_data = time_res.json()
print('2. /api/server-time RESPONSE:', time_data)

is_jakarta = time_data.get('timezone') == 'Asia/Jakarta'
is_wib_offset = time_data.get('timezoneOffset') == -420
print('3. TIMEZONE IS ASIA/JAKARTA:', is_jakarta)
print('4. TIMEZONE OFFSET IS -420 (WIB UTC+7):', is_wib_offset)

formatted_time = time_data.get('formattedTime', '')
print(f'5. FORMATTED JAKARTA SERVER TIME: {formatted_time}')
