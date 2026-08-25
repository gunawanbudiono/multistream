import requests

s = requests.Session()
s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
r = s.get('http://192.168.18.2:7575/users')

print('1. USERS PAGE 200:', r.status_code == 200)
print('2. STATUS DROPDOWN REMOVED:', 'id="editStatus"' not in r.text)
print('3. USERNAME INPUT PRESENT:', 'id="editUsername"' in r.text)
print('4. ROLE SELECT PRESENT:', 'id="editRole"' in r.text)
print('5. DYNAMIC STORAGE FUNCTION PRESENT:', 'updateStorageOverviewDynamic' in r.text)
print('6. SUSPEND BUTTON PRESENT:', 'suspendUserBtn' in r.text)
print('7. DELETE BUTTON PRESENT:', 'deleteUserBtn' in r.text)
print('8. REVOKE SESSIONS PRESENT:', 'revokeUserSessions' in r.text)
