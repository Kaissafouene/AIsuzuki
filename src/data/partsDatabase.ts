import { spressoParts } from './spressoPartsDatabase';
import { celerioParts } from './celerioPartsDatabase';

export interface Part {
  reference: string;
  designation: string;
  vehicleType: string;
  priceHT: number;
  stock: number;
  model: 'celerio' | 'spresso' | 'both';
}

export function searchParts(query: string, model?: 'celerio' | 'spresso' | 'both'): Part[] {
  // Helper: simple Levenshtein distance for typo detection
  const levenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  };

  // Helper: normalize text (remove accents, punctuation, lowercase)
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s-]/g, ' ') // keep alnum, space, dash
      .replace(/\s+/g, ' ')
      .trim();

  const tokenize = (s: string) => (s ? normalize(s).split(' ') : []);

  const synonyms: Record<string, string[]> = {
    // Vitrerie & ouvrants
    vitre: ['vitre', 'vitres', 'glace', 'glaces', 'verre', 'fenetre', 'fenêtre', 'fenêtres', 'window', 'custode', 'lunette', 'vit'],
    levevitre: ['leve vitre', 'lève vitre', 'leve-vitre', 'lève-vitre', 'lèvevitre', 'levevitre', 'mecanisme vitre', 'mécanisme vitre', 'commande vitre'],
    porte: ['porte', 'portière', 'portieres', 'door', 'portier', 'bab'],
    parebrise: ['parebrise', 'pare-brise', 'pare brise', 'windshield', 'parabrize', 'brise', 'vitre avant'],
    retroviseur: ['retroviseur', 'rétroviseur', 'miroir', 'mirroir', 'retro', 'rétro', 'mirwar'],
    lunette: ['lunette', 'vitre arriere', 'vitre arrière', 'glace arriere', 'glace arrière'],

    // Suspension & direction
    amortisseur: ['amortisseur', 'amorto', 'amort', 'suspension', 'amor', 'amortisseure', 'amortiseur', 'amor'],
    biellette: ['biellette', 'biellette de direction', 'tirant', 'bielette', 'bielle direction', 'biel'],
    rotule: ['rotule', 'rotule de direction', 'rot', 'rotul', 'boule direction'],
    triangle: ['triangle', 'bras', 'bras de suspension', 'triangl'],
    cremaillere: ['cremaillere', 'crémaillère', 'direction', 'steering', 'crem'],
    cardans: ['cardan', 'transmission', 'arbre de transmission', 'drive shaft', 'trans'],
    roulement: ['roulement', 'bearing', 'roul', 'rulman', 'roulman'],
    suspension: ['suspension', 'susp', 'ressort', 'spring'],

    // Freinage
    disque: ['disque', 'disques', 'disc', 'disk', 'disq', 'frein avant'],
    plaquette: ['plaquette', 'plaquettes', 'plaq', 'pad', 'pads', 'plak', 'plaket'],
    etrier: ['etrier', 'étrier', 'etr', 'caliper', 'etrie', 'etri'],
    tambour: ['tambour', 'tambours', 'tam', 'frein arriere', 'frein arrière'],
    frein: ['frein', 'freinage', 'brake', 'frain', 'break'],
    maitre_cylindre: ['maitre cylindre', 'maître cylindre', 'master cylinder', 'cylindre', 'mcyl'],

    // Optiques
    phare: ['phare', 'phares', 'optique', 'projecteur', 'headlight', 'light', 'dhou', 'lumiere', 'lumière'],
    feu: ['feu', 'feux', 'clignotant', 'antibrouillard', 'feux stop', 'stop', 'cligno', 'feu position', 'warning'],
    ampoule: ['ampoule', 'lampe', 'bulb', 'led', 'eclairage', 'éclairage'],
    optique: ['optique', 'bloc optique', 'bloc phare', 'lighthouse'],

    // Electricité
    batterie: ['batterie', 'battery', 'batri', 'bateri', 'accumulator', 'accu'],
    alternateur: ['alternateur', 'alternator', 'alter', 'alterno', 'alternato'],
    demarreur: ['demarreur', 'démarreur', 'starter', 'start', 'demar', 'démar'],
    capteur: ['capteur', 'sensor', 'sonde', 'detecteur', 'détecteur', 'capt'],
    faisceau: ['faisceau', 'câblage', 'cablage', 'fil', 'fils', 'wiring', 'cable'],
    boitier: ['boitier', 'boîtier', 'calculateur', 'ecu', 'module', 'control unit'],
    klaxon: ['klaxon', 'avertisseur', 'horn', 'buzzer', 'beeper'],

    // Filtration
    filtreair: ['filtre air', 'filtre à air', 'filtre-a-air', 'air filter', 'filtr air', 'filtre admission'],
    filtrehuile: ['filtre huile', 'filtre à huile', 'filtre-a-huile', 'oil filter', 'filtr huile', 'filtre lubrification'],
    filtrefuel: ['filtre carburant', 'filtre gasoil', 'filtre essence', 'filtre à carburant', 'fuel filter', 'filtre combustible', 'filtr essence'],
    filtrehabitable: ['filtre habitacle', 'filtre pollen', 'filtre cabine', 'cabin filter', 'filtre climatisation', 'filtre interieur', 'filtr habitacle'],
    filtre: ['filtre', 'filter', 'filtr', 'filtration', 'cartouche'],

    // Moteur & transmission
    courroie: ['courroie', 'courroies', 'belt', 'courroi', 'distribution', 'timing belt', 'accessoires'],
    pompeeau: ['pompe a eau', 'pompe à eau', 'water pump', 'pompe eau', 'pump water', 'pompe refroidissement'],
    pompehuile: ['pompe a huile', 'pompe à huile', 'oil pump', 'pompe huile', 'lubrification'],
    bougie: ['bougie', 'bougies', 'spark plug', 'bougi', 'sparkplug', 'allumage'],
    embrayage: ['embrayage', 'kit embrayage', 'clutch', 'emb', 'embrayag', 'embreyage', 'debrayage'],
    volantmoteur: ['volant moteur', 'volant bimasse', 'flywheel', 'volant', 'bimasse'],
    butee: ['butee', 'butée', 'butée embrayage', 'release bearing'],
    moteur: ['moteur', 'engine', 'bloc moteur', 'culasse', 'cylindre', 'motor'],
    soupape: ['soupape', 'valve', 'admission', 'echappement', 'échappement', 'valv'],
    joint: ['joint', 'gasket', 'seal', 'etancheite', 'étanchéité', 'join'],
    piston: ['piston', 'segment', 'ring', 'cylindre', 'chemise'],
    bielle: ['bielle', 'rod', 'connecting rod', 'biel'],
    vilebrequin: ['vilebrequin', 'crankshaft', 'manivelle', 'crank'],

    // Refroidissement & climatisation
    radiateur: ['radiateur', 'radiateur chauffage', 'radiateur refroidissement', 'refroidissement', 'chauffage'],
    condenseur: ['condenseur', 'condenseur clim'],
    evaporateur: ['evaporateur', 'évaporateur'],
    compresseur: ['compresseur', 'compresseur clim'],
    thermostat: ['thermostat'],
    ventilateur: ['ventilateur', 'ventilateur moteur'],

    // Carburant & alimentation
    pompecarburant: ['pompe carburant', 'pompe essence', 'fuel pump', 'pompe', 'pompe à essence', 'pompe injection', 'jauge'],
    injecteur: ['injecteur', 'injecteurs', 'injection', 'inject', 'gicleur', 'buse injection', 'injector'],
    reservoir: ['reservoir', 'réservoir', 'tank', 'reserv', 'tank essence', 'tank carburant', 'fuel tank'],
    bouchonreservoir: ['bouchon reservoir', 'bouchon réservoir', 'fuel cap', 'bouchon essence', 'cap', 'tappo'],
    carburateur: ['carburateur', 'carbu', 'carburetor', 'mixing', 'melangeur'],
    admission: ['admission', 'intake', 'collecteur admission', 'pipe admission', 'manifold'],
    papillon: ['papillon', 'throttle', 'throttle body', 'boitier papillon', 'corps papillon'],

    // Échappement
    echappement: ['echappement', 'tuyau echappement', 'silencieux', 'exhaust', 'pot', 'systeme echappement', 'sortie', 'tuyau'],
    catalyseur: ['catalyseur', 'catalytic', 'cat', 'convertisseur catalytique', 'depollution'],
    marmite: ['marmite echappement', 'marmite', 'silencieux arriere', 'pot arriere', 'rear silencer'],
    ligne: ['ligne echappement', 'ligne complete', 'full system', 'systeme complet'],

    // Climatisation
    compresseur: ['compresseur', 'compresseur clim', 'ac compressor', 'comp clim', 'compresso'],
    condenseur: ['condenseur', 'radiateur clim', 'ac radiator', 'cooling radiator'],
    evaporateur: ['evaporateur', 'évaporateur', 'cooling unit', 'unite refroidissement'],
    filtreclim: ['filtre clim', 'filtre climatisation', 'deshydrateur', 'secheur'],

    // Autres pièces courantes
    courroiedistribution: ['courroie distribution', 'courroie dentée', 'timing belt', 'distribution kit'],
    chaine: ['chaine', 'chaîne', 'chain', 'distribution chain'],
    cable: ['cable', 'câble', 'wire', 'fil', 'commande', 'control cable'],
    durite: ['durite', 'durites', 'tuyau', 'tube', 'pipe', 'hose', 'flexible'],
    collier: ['collier', 'attache', 'fixation', 'support', 'clamp', 'bracket'],
    vis: ['vis', 'boulon', 'ecrou', 'bolt', 'nut', 'screw', 'fixation'],
    clip: ['clip', 'agrafe', 'attache', 'fastener', 'rivet', 'fixation rapide'],

    // Directions/positions
    avant: ['avant', 'av'],
    arriere: ['arriere', 'arrière', 'ar'],
    gauche: ['gauche', 'g', 'conducteur'],
    droite: ['droite', 'd', 'passager'],

    // Autres positions si présentes dans la base
    superieur: ['superieur', 'supérieur'],
    inferieur: ['inferieur', 'inférieur'],
    interieur: ['interieur', 'intérieur'],
    exterieur: ['exterieur', 'extérieur']
  };

  const expandedQueryTokens = new Set<string>();
  const rawTokens = tokenize(query);
  rawTokens.forEach(t => {
    expandedQueryTokens.add(t);
    if (synonyms[t]) {
      synonyms[t].forEach(s => expandedQueryTokens.add(s));
    }
    // Add fuzzy match for typos: if token is long enough, add similar synonyms
    // e.g., "raditeur" should match "radiateur"
    for (const [key, values] of Object.entries(synonyms)) {
      if (values.some(v => levenshteinDistance(t, v) <= 2 && t.length >= 4)) {
        expandedQueryTokens.add(key);
        values.forEach(s => expandedQueryTokens.add(s));
      }
    }
  });

  // Special weights for common part types to prioritize most relevant matches
  const typeWeights: Record<string, number> = {
    'filtre': 1.2,    // Filtres sont souvent recherchés
    'huile': 1.2,     // Pièces de maintenance courante
    'frein': 1.3,     // Pièces de sécurité importantes
    'plaquette': 1.3,
    'amortisseur': 1.5, // Augmenté pour donner plus d'importance
    'courroie': 1.25, // Pièces de maintenance planifiée
    'batterie': 1.2,
    'phare': 1.15,
    'lampe': 1.15,
    'joint': 1.1,
    'moteur': 1.1
  };

  // Select database based on detected model
  let partsDatabase: Part[] = [];
  if (model === 'spresso') partsDatabase = spressoParts;
  else if (model === 'celerio') partsDatabase = celerioParts;
  else partsDatabase = [...spressoParts, ...celerioParts];

  // If query is empty, return nothing (avoid huge results)
  if (rawTokens.length === 0) return [];

    // Score each part with enhanced matching logic
    type ScoredPart = Part & { __score: number; __matches: string[] };

    const scores: ScoredPart[] = partsDatabase.map(part => {
      const ref = normalize(part.reference);
      const vtype = normalize(part.vehicleType);
      const designation = normalize(part.designation);
      const designationTokens = tokenize(part.designation);
      
      // Track which terms matched for better results explanation
      const matches: string[] = [];
      let score = 0;

      // Determine main part type from query
      const mainPartType = rawTokens.find(token => Object.keys(typeWeights).includes(token));
      
      // Strongly penalize results that don't match the main part type
      if (mainPartType && !designation.includes(mainPartType)) {
        score -= 500; // Strong penalty for wrong part type
      }

      // Boost score for common part types
      for (const [type, weight] of Object.entries(typeWeights)) {
        if (designation.includes(type)) {
          // Higher base score for exact type matches
          const baseScore = type === mainPartType ? 150 : 15;
          score += baseScore * weight;
          matches.push(`Type courant: ${type}`);
        }
      }

      // Score each token match for reference, type, and designation

    // Detect positional combinations from the query (both orders)
    const tokenSet = new Set([...expandedQueryTokens]);
    const positionTokens = rawTokens.join(' ').toLowerCase();
    
    // Check both word orders for positions
    const wantsAvant = ['avant', 'av'].some(t => tokenSet.has(t)) || 
                      /(droite|gauche|d|g)[\s-]+(avant|av)|(avant|av)[\s-]+(droite|gauche|d|g)/i.test(positionTokens);
    const wantsArriere = ['arriere', 'arrière', 'ar'].some(t => tokenSet.has(t)) ||
                        /(droite|gauche|d|g)[\s-]+(arriere|arrière|ar)|(arriere|arrière|ar)[\s-]+(droite|gauche|d|g)/i.test(positionTokens);
    const wantsGauche = ['gauche', 'g', 'conducteur'].some(t => tokenSet.has(t)) ||
                       /(avant|av|arriere|arrière|ar)[\s-]+(gauche|g)|(gauche|g)[\s-]+(avant|av|arriere|arrière|ar)/i.test(positionTokens);
    const wantsDroite = ['droite', 'd', 'passager'].some(t => tokenSet.has(t)) ||
                       /(avant|av|arriere|arrière|ar)[\s-]+(droite|d)|(droite|d)[\s-]+(avant|av|arriere|arrière|ar)/i.test(positionTokens);
    
    // Other positions remain the same as they don't typically have order variations
    const wantsSup = ['superieur', 'supérieur'].some(t => tokenSet.has(t));
    const wantsInf = ['inferieur', 'inférieur'].some(t => tokenSet.has(t));
    const wantsInt = ['interieur', 'intérieur'].some(t => tokenSet.has(t));
    const wantsExt = ['exterieur', 'extérieur'].some(t => tokenSet.has(t));

    // 1) Exact reference match gets very high score (also partial ref heuristic)
    const rawNorm = normalize(query);
    if (rawNorm && ref === rawNorm) score += 1000;
    if (rawNorm && ref.includes(rawNorm)) score += 450; // stronger
    // detect partial-looking reference token: alphanum chunk >= 5
    const refLike = rawTokens.some(t => /[a-z0-9]{5,}/i.test(t));
    if (refLike && ref.includes(rawTokens.find(t => /[a-z0-9]{5,}/i.test(t)) || '')) score += 120;

    // 2) All tokens present in designation (AND) with proximity weighting
    const mustTokens = rawTokens;
    const allPresent = mustTokens.every(q => designationTokens.some(dt => dt.includes(q)));
    if (allPresent) {
      score += 220;
      const joined = designationTokens.join(' ');
      const joinedQ = mustTokens.join(' ');
      if (joined.includes(joinedQ)) score += 90;
    }

    // 2b) Directional pattern matching for both orders of position words
    const designation_normalized = part.designation.toLowerCase();
    
    // Check for position combinations in both orders in the designation
    const hasAV = designationTokens.some(dt => dt === 'av' || dt.includes('avant')) || 
                 /\bAV\b/i.test(part.designation) ||
                 /(droite|gauche|d|g)[\s-]+(avant|av)|(avant|av)[\s-]+(droite|gauche|d|g)/i.test(designation_normalized);
    
    const hasAR = designationTokens.some(dt => dt === 'ar' || dt.includes('arriere') || dt.includes('arrière')) || 
                 /\bAR\b/i.test(part.designation) ||
                 /(droite|gauche|d|g)[\s-]+(arriere|arrière|ar)|(arriere|arrière|ar)[\s-]+(droite|gauche|d|g)/i.test(designation_normalized);
    
    const hasG = designationTokens.some(dt => dt === 'g' || dt.includes('gauche') || dt.includes('conducteur')) || 
                /\bG\b/i.test(part.designation) ||
                /(avant|av|arriere|arrière|ar)[\s-]+(gauche|g)|(gauche|g)[\s-]+(avant|av|arriere|arrière|ar)/i.test(designation_normalized);
    
    const hasD = designationTokens.some(dt => dt === 'd' || dt.includes('droite') || dt.includes('passager')) || 
                /\bD\b/i.test(part.designation) ||
                /(avant|av|arriere|arrière|ar)[\s-]+(droite|d)|(droite|d)[\s-]+(avant|av|arriere|arrière|ar)/i.test(designation_normalized);
    
    // Other positions remain the same as they don't typically have order variations
    const hasSup = designationTokens.some(dt => dt.includes('superieur') || dt.includes('supérieur'));
    const hasInf = designationTokens.some(dt => dt.includes('inferieur') || dt.includes('inférieur'));
    const hasInt = designationTokens.some(dt => dt.includes('interieur') || dt.includes('intérieur'));
    const hasExt = designationTokens.some(dt => dt.includes('exterieur') || dt.includes('extérieur'));

    // single-dimension boosts
    if (wantsAvant && hasAV) score += 150;
    if (wantsArriere && hasAR) score += 150;
    if (wantsGauche && hasG) score += 130;
    if (wantsDroite && hasD) score += 130;
    if (wantsSup && hasSup) score += 80;
    if (wantsInf && hasInf) score += 80;
    if (wantsInt && hasInt) score += 60;
    if (wantsExt && hasExt) score += 60;

    // pair boosts (e.g., avant+gauche)
    if (wantsAvant && wantsGauche && hasAV && hasG) score += 220;
    if (wantsAvant && wantsDroite && hasAV && hasD) score += 220;
    if (wantsArriere && wantsGauche && hasAR && hasG) score += 220;
    if (wantsArriere && wantsDroite && hasAR && hasD) score += 220;

    // penalties if opposite
    if (wantsAvant && hasAR) score -= 120;
    if (wantsArriere && hasAV) score -= 120;
    if (wantsGauche && hasD) score -= 90;
    if (wantsDroite && hasG) score -= 90;

    // 3) Partial prefix matches for typos and vehicleType bonus
    for (const q of rawTokens) {
      const q3 = q.slice(0, 3);
      if (q3 && designationTokens.some(dt => dt.startsWith(q3))) score += 25;
      if (vtype.includes(q)) score += 60; // stronger boost for exact vehicleType code
    }

    // 4) Synonym and expanded token presence
    for (const q of expandedQueryTokens) {
      if (designation.includes(q)) score += 18;
    }

    // 5) Boost currently selected model and deprioritize other model when both present
    if (model && part.model === model) score += 80;
    if (model && part.model !== model && part.model !== 'both') score -= 50;

    // 6) Prefer in-stock items
    if (part.stock > 0) score += 8;

    return { ...part, __score: score, __matches: matches };
  });

  // Keep only relevant results (score threshold)
  // Apply minimum score threshold and boost scores based on match quality
  const filtered = scores
    .filter(p => {
      // Ne garder que les résultats avec un score positif ET
      // si un type principal est recherché, ne garder que les pièces de ce type
      const mainPartType = rawTokens.find(token => Object.keys(typeWeights).includes(token));
      return p.__score > 0 && (!mainPartType || normalize(p.designation).includes(mainPartType));
    })
    .map(p => {
      // Boost score based on match quality and context
      const matchQuality = p.__matches.length;
      const hasRefMatch = p.__matches.some(m => m.includes('Référence'));
      const hasExactMatch = p.__matches.some(m => m.includes('exact'));

      // Quality multipliers
      let finalScore = p.__score;
      if (hasRefMatch) finalScore *= 1.3;
      if (hasExactMatch) finalScore *= 1.2;
      if (matchQuality >= 3) finalScore *= 1.15;
      
      // Ensure matches are unique
      const uniqueMatches = Array.from(new Set(p.__matches));
      
      return { ...p, __score: finalScore, __matches: uniqueMatches };
    });

  // Sort by score desc, then by stock desc to prefer available ones
  filtered.sort((a, b) => b.__score - a.__score || b.stock - a.stock);

  // Adapt TOP_N based on query specificity and match quality
  const specificity = ['avant','arriere','arrière','av','ar','gauche','droite','g','d','conducteur','passager','superieur','inferieur','interieur','exterieur']
    .filter(t => expandedQueryTokens.has(t)).length;
  const TOP_N = Math.max(2, specificity >= 2 ? 3 : 5);

  return filtered
    .slice(0, TOP_N)
    .map(({ __score, __matches, ...p }) => p);
}
