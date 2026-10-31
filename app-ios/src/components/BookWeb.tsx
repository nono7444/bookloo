// Une page du serveur Bookloo dans l'appli : le site garde ses fonctions (recherche, fiches, liseuse,
// écoute…), l'appli lui donne l'allure de Lumio (noir profond, sans bandeau du site, barre d'onglets en verre).
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { useServer } from '@/lib/server';
import { C, TAB_SPACE } from '@/lib/theme';

/** Pages de lecture / écoute : plein écran, sans barre d'onglets */
const READER_RE = '\\/(lecture|liseuse|ecoute)(\\.html)?([?#/]|$)';
export const isReader = (url: string) => new RegExp(READER_RE, 'i').test(url);
const isLogin = (url: string) => /\/login(\.html)?([?#]|$)/i.test(url);

/** Feuille de style ajoutée à chaque page (la CSP du site autorise les feuilles construites en JS). */
function styleScript(top: number, bottom: number) {
  const css = `
    :root {
      --encre: #000000; --surface: #121212; --surface-2: #1C1C1E; --trait: #2A2A2C;
      --papier: #FFFFFF; --papier-mat: #A1A1A6; --verre: rgba(28,28,30,0.72);
    }
    html, body { background: #000 !important; -webkit-tap-highlight-color: transparent; }
    header.bandeau { display: none !important; }
    body.bl-app:not(.bl-lecture) { padding-top: ${top}px !important; padding-bottom: ${bottom}px !important; }
    body.bl-app.bl-lecture { padding-top: env(safe-area-inset-top); }
    input, select, textarea { font-size: 16px !important; } /* pas de zoom automatique d'iOS */
  `;
  return `(function(){try{
    var apply=function(){
      if(!document.body){return false}
      document.body.classList.add('bl-app');
      if(new RegExp(${JSON.stringify(READER_RE)},'i').test(location.href)) document.body.classList.add('bl-lecture');
      return true;
    };
    if(!window.__blSheet){
      var s=new CSSStyleSheet(); s.replaceSync(${JSON.stringify(css)});
      document.adoptedStyleSheets=[].concat(document.adoptedStyleSheets||[],[s]);
      window.__blSheet=s;
    }
    if(!apply()) document.addEventListener('DOMContentLoaded', apply);
  }catch(e){}})(); true;`;
}

export type BookWebHandle = { home: () => void; reload: () => void };

type Props = {
  /** Page de départ, ex. « /accueil.html » */
  path: string;
  /** Au-dessus de la barre d'onglets (place en bas) */
  withTabBar?: boolean;
  /** Onglet visible : seul lui pilote le plein écran */
  focused?: boolean;
  /** Place en haut pour l'heure / l'encoche (non quand un en-tête natif est au-dessus) */
  topInset?: boolean;
};

export const BookWeb = forwardRef<BookWebHandle, Props>(function BookWeb({ path, withTabBar = true, focused = true, topInset = true }, ref) {
  const { url, authNonce, bumpAuth, setImmersive } = useServer();
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(0); // change → retour à la page de départ
  const sawLogin = useRef(false);

  const startUri = `${url}${path}`;
  const host = useMemo(() => {
    try {
      return new URL(url ?? '').host;
    } catch {
      return '';
    }
  }, [url]);

  useImperativeHandle(ref, () => ({
    home: () => {
      setError(null);
      setStart((n) => n + 1);
    },
    reload: () => web.current?.reload(),
  }));

  const onNav = useCallback(
    (e: WebViewNavigation) => {
      setCurrent(e.url);
      if (isLogin(e.url)) sawLogin.current = true;
      else if (sawLogin.current && !e.loading) {
        // Connexion réussie dans cette page : les autres onglets se rechargent
        sawLogin.current = false;
        bumpAuth();
      }
      if (focused) setImmersive(isReader(e.url));
    },
    [bumpAuth, focused, setImmersive],
  );

  if (!url) return null;
  const script = styleScript(topInset ? insets.top + 8 : 8, withTabBar ? TAB_SPACE + insets.bottom : insets.bottom + 16);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <WebView
        key={`${authNonce}-${start}`}
        ref={web}
        source={{ uri: startUri }}
        style={{ flex: 1, backgroundColor: C.bg }}
        containerStyle={{ backgroundColor: C.bg }}
        originWhitelist={['*']}
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsLinkPreview={false}
        pullToRefreshEnabled
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        injectedJavaScriptBeforeContentLoaded={script}
        injectedJavaScript={script}
        onNavigationStateChange={onNav}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <ActivityIndicator color={C.text} />
          </View>
        )}
        onShouldStartLoadWithRequest={(req) => {
          // Liens vers un autre site (débrideur, source…) : ouverts dans Safari
          if (!req.isTopFrame || !/^https?:/i.test(req.url)) return true;
          try {
            if (new URL(req.url).host === host) return true;
          } catch {
            return true;
          }
          Linking.openURL(req.url).catch(() => {});
          return false;
        }}
        onFileDownload={({ nativeEvent }) => {
          // Fichier à télécharger : Safari s'en charge (Fichiers, Livres…)
          Linking.openURL(nativeEvent.downloadUrl).catch(() => {});
        }}
        onError={(e) => setError(e.nativeEvent.description || 'Serveur injoignable')}
        onContentProcessDidTerminate={() => web.current?.reload()}
      />
      {error ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: C.bg, padding: 32 }]}>
          <Ionicons name="cloud-offline-outline" size={44} color={C.textDim} />
          <Text style={styles.errTitle}>Bookloo ne répond pas</Text>
          <Text style={styles.errText}>{error}</Text>
          <Text style={styles.errText} numberOfLines={1}>
            {current || startUri}
          </Text>
          <Pressable
            onPress={() => {
              setError(null);
              setStart((n) => n + 1);
            }}
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}>
            <Text style={styles.retryTxt}>Réessayer</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  errTitle: { color: C.text, fontSize: 19, fontWeight: '800', marginTop: 6 },
  errText: { color: C.textDim, fontSize: 14, textAlign: 'center' },
  retry: { marginTop: 14, backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11 },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
