import requests

s = requests.Session()
s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
r = s.get('http://192.168.18.2:7575/users')

print('1. USERS PAGE 200:', r.status_code == 200)

# Card 1 verification
print('2. CARD 1 (ACCOUNTS REGISTERED):', 'Accounts Registered' in r.text and 'Member Accounts' in r.text)

# Card 2 verification
print('3. CARD 2 (GLOBAL STORAGE POOL):', 'Global Storage Pool' in r.text and 'GB Available' in r.text and 'Media Files' in r.text and 'Physical Free' in r.text)

# Card 3 verification
print('4. CARD 3 (CHANNELS CONFIGURED):', 'Channels Configured' in r.text and 'Multi-Channel RTMP' in r.text)
print('5. BROADCASTER V2.2 EXCLUDED:', 'Broadcaster v2.2' not in r.text)
