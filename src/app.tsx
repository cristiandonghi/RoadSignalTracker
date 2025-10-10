import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';  // FIX: Import CSS essenziale per visualizzare la mappa

// Fix per icone Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RoadSign {
  id: string;
  type: string;
  lat: number;
  lng: number;
  timestamp: Date | string;  // Aggiungi | string per compatibilità storage
}

interface User {
  email: string;
  password: string;  // In produzione, non salvare password! (Qui hashed per demo)
}

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('users');
    return saved ? JSON.parse(saved) : [{ email: 'user@example.com', password: btoa('password123') }];  // Salva hashed per demo
  });
  const [roadSigns, setRoadSigns] = useState<RoadSign[]>(() => {
    const saved = localStorage.getItem('roadSigns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Converti timestamp da ISO string a Date
        return parsed.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
      } catch (e) {
        console.error('Errore nel caricamento roadSigns:', e);
        return [];
      }
    }
    return [];
  });

  const [showScanner, setShowScanner] = useState(false);
  const [selectedSignType, setSelectedSignType] = useState('works');  // Default: 'works'
  const [map, setMap] = useState<L.Map | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Tipi di cartelli (per select e marker)
  const signTypes = [
    { id: 'works', name: 'Lavori in Corso', color: 'orange', image: "./src/divieto_di_sosta" },
    { id: 'speed_limit_30', name: 'Limite 30KM/H', color: 'red' },
    { id: 'mandatory_turn', name: 'Obbligo Freccia ', color: 'blue' },
    { id: 'no_parking', name: 'Divieto di Sosta', color: 'red' }
  ];

  // Carica stato login da LocalStorage
  useEffect(() => {
    const savedLogin = localStorage.getItem('isLoggedIn');
    const savedEmail = localStorage.getItem('userEmail');
    if (savedLogin === 'true' && savedEmail) {
      setIsLoggedIn(true);
      setEmail(savedEmail);
    }
  }, []);

  // Inizializza mappa solo quando loggato (FIX: Estratto, senza annidamenti)
  useEffect(() => {
    if (isLoggedIn && mapRef.current && !map) {
      console.log('Inizializzando mappa Leaflet...');  // Debug
      const mapInstance = L.map(mapRef.current).setView([45.4642, 9.1900], 9);  // FIX: Centro su Milano
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(mapInstance);

      // FIX: Invalidate size immediatamente e con timeout per container dinamico
      mapInstance.invalidateSize();
      setTimeout(() => {
        if (mapInstance) {
          mapInstance.invalidateSize();
          console.log('Mappa ridimensionata e visibile!');  // Debug
        }
      }, 100);

      setMap(mapInstance);
    }
  }, [isLoggedIn]);  // Rimossa dipendenza 'map' per evitare loop

  // Sincronizza marker sulla mappa con roadSigns (ricrea quando cambia) (FIX: Estratto come top-level)
  useEffect(() => {
    if (map) {
      // Rimuovi tutti i marker esistenti (tranne tile layer)
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });

      if (roadSigns.length > 0) {
        // Aggiungi nuovi marker per i roadSigns attuali
        roadSigns.forEach((sign) => {
          const selectedSign = signTypes.find(s => s.id === sign.type) || signTypes[0];
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${selectedSign.color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${selectedSign.id.charAt(0).toUpperCase()}</div>`,  // FIX: Corretto da ${Image}
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          const marker = L.marker([sign.lat, sign.lng], { icon: customIcon })
            .addTo(map)
            .bindPopup(`
              <div style="text-align: center; min-width: 180px;">
                <img src="${getSignImageUrl(sign.type)}" alt="${getSignName(sign.type)}" style="width: 64px; height: 64px; margin: 0 auto 8px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" />
                <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: bold;">${getSignName(sign.type)}</h3>
                <p style="margin: 0 0 4px; font-size: 12px; color: #666;">Lat: ${sign.lat.toFixed(4)} | Lng: ${sign.lng.toFixed(4)}</p>
                <p style="margin: 0; font-size: 12px; color: #999;">Scansionato: ${sign.timestamp.toLocaleString()}</p>
              </div>
            `);
        });

        // Opzionale: Fit bounds ai marker se ce ne sono
        const group = L.featureGroup(roadSigns.map(s => L.marker([s.lat, s.lng])));
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
      }

      setTimeout(() => map.invalidateSize(), 100);  // Rinfresca vista (FIX: Integrato qui)
    }
  }, [roadSigns, map, signTypes]);  // Dipendenze: roadSigns per trigger, map e signTypes per creazione

  // Salva roadSigns in localStorage ogni volta che cambiano (solo se loggato) (FIX: Estratto come top-level)
  useEffect(() => {
    if (isLoggedIn && roadSigns.length > 0) {
      // Salva con timestamp come ISO string per serializzazione
      const toSave = roadSigns.map(s => ({ ...s, timestamp: (s.timestamp as Date).toISOString() }));  // Cast esplicito per safety
      localStorage.setItem('roadSigns', JSON.stringify(toSave));
    } else if (!isLoggedIn) {
      localStorage.removeItem('roadSigns');  // Pulisci se non loggato
    }
  }, [roadSigns, isLoggedIn]);

  // Hash password semplice (demo)
  const hashPassword = (pw: string) => btoa(pw);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const hashedInput = hashPassword(password);
    const user = users.find(u => u.email === email && u.password === hashedInput);  // Confronta hashed
    if (user) {
      setIsLoggedIn(true);
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', email);
      setSuccess('Login riuscito! Benvenuto!');
      setTimeout(() => setSuccess(''), 3000);
      // Non resettare roadSigns: mantieni persistenza
    } else {
      setError('Email o password errati. Prova user@example.com / password123');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (users.find(u => u.email === email)) {
      setError('Email già registrata!');
      return;
    }
    const hashedPassword = hashPassword(password);  // Hash per sicurezza demo
    const newUser:User  = { email, password: hashedPassword };  // FIX: Spazi corretti
    const updatedUsers = [...users, newUser ];  // Calcola nuovo array prima
    setUsers(updatedUsers);
    localStorage.setItem('users', JSON.stringify(updatedUsers));  // FIX: Usa array aggiornato
    setSuccess('Account creato! Ora accedi.');
    setShowRegister(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    setEmail('');
    setPassword('');
    setRoadSigns([]);  // Reset stato
    localStorage.removeItem('roadSigns');  // FIX: Rimuovi dal storage al logout
    if (map) {
      map.remove();
      setMap(null);
    }
  };

  const handleScanQR = async () => {
    setShowScanner(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const selectedSign = signTypes.find(s => s.id === selectedSignType) || signTypes[0];
          const newSign: RoadSign = {
            id: Date.now().toString(),
            type: selectedSign.id,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: new Date()
          };
          setRoadSigns(prev => [...prev, newSign]);
          // Il marker verrà aggiunto dal useEffect sync (non qui, per consistenza)
          setShowScanner(false);
          alert(`✅ Cartello "${getSignName(selectedSign.id)}" selezionato e scansionato!`);
        },
        (error) => {
          console.error('Errore GPS:', error);
          alert('❌ Errore GPS: ' + error.message);
          setShowScanner(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      alert('❌ Geolocalizzazione non supportata.');
      setShowScanner(false);
    }
  };

  const handleRemoveSign = (id: string) => {
  const signToRemove = roadSigns.find(s => s.id === id);
  if (signToRemove) {
    setRoadSigns(prev => prev.filter(s => s.id !== id));  // Rimuovi per ID
    alert(`🗑️ Cartello "${getSignName(signToRemove.type)}" rimosso!`);
  }
};


  const getSignName = (type: string) => signTypes.find(s => s.id === type)?.name || 'Sconosciuto';
  const getSignImageUrl = (type: string) => {
    const typeMap: Record<string, string> = {
      'works': '🛣️ Lavori',
      'speed_limit_30': '🚦 30 KM/H',
      'mandatory_turn': '🔄 Obbligo',
      'no_parking': '🚫 No Parcheggio'
    };
    const text = typeMap[type] || 'Sign';
    return `https://via.placeholder.com/64x64/${getColorForType(type)}/white?text=${encodeURIComponent(text)}`;
  };
  const getColorForType = (type: string) => signTypes.find(s => s.id === type)?.color || 'gray';

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 fade-in">
        <Card className="w-full max-w-md card-elevated">
          <CardHeader className="space-y-1">
            <CardTitle className="text-3xl font-bold text-center text-gray-900">Road Sign Tracker</CardTitle>
            <p className="text-center text-sm text-gray-600">Accedi o registrati per iniziare</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            <form onSubmit={showRegister ? handleRegister : handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  className="input-field"
                  placeholder="user@example.com"  // FIX: Placeholder corretto
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  className="input-field"
                  placeholder="password123"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
              </div>
              <Button type="submit" className="btn-login"> {showRegister ? 'Registrati' : 'Accedi'} </Button>
            </form>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => { setShowRegister(!showRegister); setError(''); setSuccess(''); }}
              className="w-full mt-2"
            >
              {showRegister ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
            </Button>
            <p className="text-xs text-center text-gray-500 mt-4">
              Utente demo: user@example.com / password123
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Schermata principale
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 fade-in">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-lg">
          <h1 className="text-3xl font-bold text-gray-900">Road Sign Tracker</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Benvenuto, {email}</span>
            <Button variant="outline" onClick={handleLogout} className="btn-logout">Logout</Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="card-elevated">
            <CardHeader>
                           <CardTitle>Mappa Interattiva</CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={mapRef} id="map" className="w-full h-96 min-h-96 bg-gray-200 rounded-lg"></div>  {/* FIX: min-h per sicurezza */}
              {roadSigns.length > 0 && <p className="text-sm text-gray-600 mt-2 text-center">Zoomma per vedere i marker!</p>}
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Azioni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selezione Cartello (nuova feature) */}
              <div className="space-y-2">
                <Label htmlFor="signType">Scegli Tipo Cartello</Label>
                <select
                  id="signType"
                  value={selectedSignType}
                  onChange={(e) => setSelectedSignType(e.target.value)}
                  className="input-field"  // Usa classe Tailwind per stile
                >
                  {signTypes.map((sign) => (
                    <option key={sign.id} value={sign.id}>
                      {sign.name} ({sign.color})
                    </option>
                  ))}
                </select>
              </div>
              <Button 
                onClick={handleScanQR} 
                className="btn-scan" 
                disabled={showScanner}
                size="lg"
              >
                {showScanner ? '🔄 Inserimento in Corso...' : '📱 Inserisci un Cartello'}
              </Button>

              <div className="text-sm text-gray-600 space-y-1">
                <p>• Seleziona il tipo di cartello dal Menu</p>
                <p>• Usa GPS reale del dispositivo</p>
                <p>• Aggiunge marker colorato sulla mappa</p>
              </div>
            


            </CardContent>
          </Card>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Elenco Cartelli presenti in cantiere ({roadSigns.length})</CardTitle>  {/* FIX: Refuso corretto */}
          </CardHeader>
          <CardContent>
            {roadSigns.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">Nessun cartello presente in cantiere.</p>  {/* FIX: Refuso corretto */}

              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {roadSigns.map((sign) => (
                  <div key={sign.id} className="flex items-center space-x-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <img 
                      src={getSignImageUrl(sign.type)} 
                      alt={getSignName(sign.type)} 
                      className="w-12 h-12 rounded-lg flex-shrink-0" 
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">{getSignName(sign.type)}</h4>
                      <p className="text-sm text-gray-500 truncate">{(sign.timestamp as Date).toLocaleString()}</p>  {/* Cast per safety */}
                    </div>
                   <div className="flex flex-col items-end space-y-1 text-sm text-gray-600 min-w-0">
  <p>Lat: {sign.lat.toFixed(4)}</p>
  <p>Lng: {sign.lng.toFixed(4)}</p>
  <Button 
    onClick={() => handleRemoveSign(sign.id)} 
    variant="destructive" 
    size="sm"
    className="mt-1 px-3 py-1 text-xs"
  >
    🗑️ Rimuovi
  </Button>
</div>

                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default App;
