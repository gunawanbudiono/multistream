import requests

s = requests.Session()
s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
r = s.get('http://192.168.18.2:7575/users')

print('1. USERS PAGE 200:', r.status_code == 200)
# Check table action button order: Detail before Impersonate
idx_detail = r.text.find('<span>Detail</span>')
idx_impersonate = r.text.find('<span>Impersonate</span>')
print('2. DETAIL COMES BEFORE IMPERSONATE:', idx_detail < idx_impersonate)

# Check GB formatting
print('3. STORAGE IN GB (NO "0 B"):', '0 B' not in r.text and '0 GB' in r.text)

# Check Reset Avatar button
print('4. RESET AVATAR BUTTON PRESENT:', 'resetAvatarBtn' in r.text)

# Check Anti-Autofill attributes
print('5. ANTI-AUTOFILL PRESENT:', 'autocomplete="new-password"' in r.text)
