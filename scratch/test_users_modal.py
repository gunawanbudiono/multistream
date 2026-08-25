import requests

s = requests.Session()
s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
r = s.get('http://192.168.18.2:7575/users')

print('1. USERS PAGE 200:', r.status_code == 200)
print('2. HAS DETAIL BUTTON IN TABLE:', '<span>Detail</span>' in r.text)
print('3. HAS STORAGE OVERVIEW IN MODAL:', 'Server Storage Overview' in r.text)
print('4. HAS SUSPEND BUTTON IN MODAL:', 'suspendUserBtn' in r.text)
print('5. HAS DELETE BUTTON IN MODAL:', 'deleteUserBtn' in r.text)
print('6. HAS REVOKE SESSIONS IN MODAL:', 'revokeUserSessions' in r.text)
print('7. HAS EYE TOGGLE IN MODAL:', 'togglePasswordVisibility' in r.text)
