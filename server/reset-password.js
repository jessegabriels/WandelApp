/* reset-password.js — zet een nieuw wachtwoord voor een bestaande gebruiker.
   Alleen bedoeld voor de serverbeheerder (jij), rechtstreeks op de server.

   Gebruik:
     node reset-password.js                      -> toont alle gebruikersnamen
     node reset-password.js <gebruiker> <nieuw>  -> zet een nieuw wachtwoord
   Voorbeeld:
     node reset-password.js jesse mijnnieuwpw
*/

const bcrypt = require('bcryptjs');
const { db } = require('./db');

const username = (process.argv[2] || '').toLowerCase().trim();
const newPassword = process.argv[3] || '';

if (!username) {
  const users = db.prepare('SELECT username, display_name FROM users ORDER BY username').all();
  if (!users.length) { console.log('Er zijn nog geen gebruikers.'); process.exit(0); }
  console.log('Gebruikers:');
  users.forEach((u) => console.log('  - ' + u.username + '  (' + u.display_name + ')'));
  console.log('\nGebruik: node reset-password.js <gebruikersnaam> <nieuw-wachtwoord>');
  process.exit(0);
}

if (newPassword.length < 6) {
  console.error('Geef een nieuw wachtwoord van minstens 6 tekens op.');
  console.error('Gebruik: node reset-password.js ' + username + ' <nieuw-wachtwoord>');
  process.exit(1);
}

const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!user) {
  console.error('Geen gebruiker gevonden met naam "' + username + '". Draai zonder argumenten voor de lijst.');
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
console.log('Wachtwoord van "' + username + '" is bijgewerkt. Je kunt nu inloggen met het nieuwe wachtwoord.');
