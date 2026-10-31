// Source AltStore / FlareStore / SideStore de l'appli Bookloo (mises à jour automatiques).
// Usage : node scripts/make-source.mjs <version> <tag> <ipa>
import { statSync, writeFileSync } from 'node:fs';

const [version, tag, ipa = 'bookloo-unsigned.ipa'] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY || 'nono7444/bookloo';
const size = statSync(ipa).size;
const date = new Date().toISOString();
const notes = (process.env.RELEASE_NOTES || '')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^(Co-Authored-By|Claude-Session|Merge branch)/i.test(l))
  .slice(0, 15)
  .join('\n');
const downloadURL = `https://github.com/${repo}/releases/download/${tag}/${ipa}`;
const iconURL = `https://raw.githubusercontent.com/${repo}/main/app-ios/assets/icon.png`;

const source = {
  name: 'Bookloo',
  identifier: 'lol.wawanono.bookloo.source',
  sourceURL: `https://github.com/${repo}/releases/latest/download/altstore.json`,
  subtitle: 'Livres, BD, mangas et livres audio',
  iconURL,
  tintColor: '#E6485C',
  apps: [
    {
      name: 'Bookloo',
      bundleIdentifier: 'lol.wawanono.bookloo',
      developerName: 'Norman',
      subtitle: 'Ta bibliothèque maison',
      localizedDescription: 'Recherche, lecture et écoute depuis ton serveur Bookloo.',
      iconURL,
      tintColor: '#E6485C',
      category: 'reference',
      version,
      versionDate: date,
      downloadURL,
      size,
      versions: [{ version, buildVersion: version.split('.').pop(), date, size, downloadURL, minOSVersion: '16.4', localizedDescription: notes || `Build ${tag}` }],
      appPermissions: { entitlements: [], privacy: {} },
    },
  ],
  news: [],
};
writeFileSync('altstore.json', JSON.stringify(source, null, 2));
console.log(`altstore.json : Bookloo ${version} → ${downloadURL} (${size} octets)`);
