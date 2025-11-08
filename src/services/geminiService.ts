const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Validate API key on startup
if (!GEMINI_API_KEY) {
  console.error('❌ ERREUR: VITE_GEMINI_API_KEY n\'est pas définie dans les variables d\'environnement');
  throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file');
}

export interface VehicleInfo {
  id?: number; // optional local identifier (added by caller)
  immatriculation?: string;
  immatriculationRaw?: string; // raw value returned by OCR/LLM (may contain VIN)
  immatriculationWarning?: string; // explanation if immatriculation looks invalid (eg. VIN detected)
  marque?: string;
  modele?: string;
  typeMoteur?: string;
  annee?: string;
}

export async function extractVehicleInfoFromImage(imageData: string): Promise<VehicleInfo> {
  const prompt = `Tu es un expert en extraction de données de cartes grises tunisiennes et françaises.
Analyse L'IMAGE fournie et retourne UNIQUEMENT un JSON strict (sans texte autour) avec les champs suivants:
{
  "immatriculation": "numéro d'immatriculation (nettoyé)",
  "marque": "marque du véhicule (SUZUKI UNIQUEMENT)",
  "modele": "modèle exact (Celerio ou S-Presso, accepter variantes: S PRESSO, SPRESSO)",
  "typeMoteur": "type de moteur (si visible)",
  "annee": "année de fabrication (4 chiffres)"
}

RÈGLES STRICTES:
- MARQUE: doit contenir SUZUKI. Si autre marque, retourne {"error":"invalid_model"}.
- MODÈLE: doit être CELERIO ou S-PRESSO (accepte variantes visuelles: "S PRESSO", "SPRESSO"). Si autre modèle, retourne {"error":"invalid_model"}.
- IMMATRICULATION: lis le champ officiel (Tunisie/France). Nettoie: majuscules, retirer séparateurs exotiques. EXCLUS: ne JAMAIS renvoyer un VIN (17 caractères alphanum sans I/O/Q). Si un VIN est détecté, laisse le champ vide ou null.
- ANNÉE: extrais 4 chiffres plausibles (2000..année courante+1). Si non lisible, laisse vide.
- TYPE MOTEUR: optionnel (laisser vide si non visible).
- Si incertain sur modèle/marque, retourne {"error":"invalid_model"}.
- Réponds STRICTEMENT avec le JSON, sans commentaire, sans markdown, sans texte en plus.`;

  try {
    // Detect mime type from data URL
    let mimeType = 'image/jpeg'; // default
    if (imageData.startsWith('data:image/png')) mimeType = 'image/png';
    else if (imageData.startsWith('data:image/jpeg')) mimeType = 'image/jpeg';
    else if (imageData.startsWith('data:image/jpg')) mimeType = 'image/jpeg';
    else if (imageData.startsWith('data:image/webp')) mimeType = 'image/webp';
    else if (imageData.startsWith('data:image/heic')) mimeType = 'image/heic';
    else if (imageData.startsWith('data:image/heif')) mimeType = 'image/heif';
    else if (imageData.startsWith('data:application/pdf')) mimeType = 'application/pdf';
    
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageData.split(',')[1]
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    
    const parsed = JSON.parse(jsonText) as VehicleInfo;

    // Early invalid model check
    if ((parsed as any).error === 'invalid_model') {
      throw new Error('INVALID_MODEL');
    }

    // Normalize marque
    const marque = (parsed.marque || '').toString().toUpperCase().trim();
    if (!marque.includes('SUZUKI')) {
      throw new Error('INVALID_MODEL');
    }

    // Normalize modèle: unify S-Presso variants
    const modeleRaw = (parsed.modele || '').toString().trim();
    const modeleNorm = modeleRaw.toUpperCase().replace(/\s+/g, '').replace(/\./g, '');
    let modeleCanon = '';
    if (modeleNorm.includes('CELERIO')) {
      modeleCanon = 'Celerio';
    } else if (modeleNorm.includes('SPRESSO') || modeleNorm.includes('S-PRESSO')) {
      modeleCanon = 'S-Presso';
    } else {
      throw new Error('INVALID_MODEL');
    }

    // Keep the raw immatriculation for audit / correction
    const rawImmat = parsed.immatriculation ? parsed.immatriculation.toString() : '';
    parsed.immatriculationRaw = rawImmat;

    // Clean immatriculation: uppercase, trim and remove suspicious chars
    let cleaned = rawImmat.trim().toUpperCase();
    cleaned = cleaned.replace(/[^A-Z0-9\- ]/g, '');

    // VIN detection and plausible immat heuristic
    const maybeVin = cleaned.replace(/\s+/g, '');
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i; // VIN chars (no I,O,Q)

    // Helper: try to find a plate-like token inside the full text response
    const extractPlateFromText = (src: string) => {
      if (!src) return '';
      // find tokens with both letters and digits, 4..10 chars after removing separators
      const rawMatches = src.match(/\b[A-Z0-9][A-Z0-9\-\s]{2,10}[A-Z0-9]\b/gi) || [];
      const candidates = rawMatches
        .map(s => s.replace(/[^A-Z0-9]/gi, '').toUpperCase())
        .filter(s => s.length >= 4 && s.length <= 10 && /[A-Z]/.test(s) && /\d/.test(s) && !vinRegex.test(s));
      return candidates.length ? candidates[0] : '';
    };

    // If the parsed value looks like a VIN or otherwise suspicious, try to find a better candidate in the full LLM text
    if (maybeVin.length === 17 && vinRegex.test(maybeVin)) {
      // prefer to extract a plate-like token from the raw LLM response text if available
      const alt = extractPlateFromText(text);
      if (alt) {
        parsed.immatriculation = alt;
        parsed.immatriculationWarning = undefined;
      } else {
        parsed.immatriculation = undefined;
        parsed.immatriculationWarning = 'La valeur extraite ressemble à un VIN (17 caractères). Veuillez corriger l\'immatriculation.';
      }
    } else {
      // Plausibility checks: too short (<3) or too long (>12) mark as undefined but try alt
      const compact = cleaned.replace(/\s|\-/g, '');
      if (cleaned.length === 0) {
        // no value parsed, try to extract from full text
        const alt = extractPlateFromText(text);
        if (alt) parsed.immatriculation = alt;
        else parsed.immatriculation = undefined;
      } else if (compact.length < 3 || compact.length > 12) {
        const alt = extractPlateFromText(text);
        if (alt) {
          parsed.immatriculation = alt;
          parsed.immatriculationWarning = undefined;
        } else {
          parsed.immatriculation = undefined;
          parsed.immatriculationWarning = 'Immatriculation douteuse. Veuillez vérifier manuellement.';
        }
      } else {
        // if cleaned looks plausible, still try to prefer a better candidate from text (avoid numeric ids)
        const alt = extractPlateFromText(text);
        if (alt && alt !== cleaned) {
          // prefer candidate that contains letters+digits and is not identical to raw cleaned value
          parsed.immatriculation = alt;
        } else {
          parsed.immatriculation = cleaned;
        }
      }
    }

    // Normalize marque/modele fields to canonical values
    parsed.marque = 'SUZUKI';
    parsed.modele = modeleCanon;

    // Normalize year: extract 4-digit reasonable year
    const yearRaw = (parsed.annee || '').toString();
    const yearMatch = yearRaw.match(/(20\d{2}|19\d{2})/);
    if (yearMatch) {
      const y = parseInt(yearMatch[1], 10);
      const current = new Date().getFullYear() + 1;
      if (y >= 2000 && y <= current) parsed.annee = String(y);
      else parsed.annee = undefined;
    } else if (parsed.annee) {
      parsed.annee = undefined;
    }

    // Optional typeMoteur cleanup
    if (parsed.typeMoteur) parsed.typeMoteur = parsed.typeMoteur.toString().trim();

    return parsed;
  } catch (error) {
    console.error('Error extracting vehicle info:', error);
    throw error;
  }
}

export async function chatWithGemini(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>,
  context?: string
): Promise<string> {
  const systemPrompt = `Tu es un Assistant IA Suzuki spécialisé dans les pièces de rechange. Tu es professionnel, courtois et efficace.

CONTEXTE: ${context || 'Aucun véhicule détecté'}

⚠️ RÈGLE ABSOLUE - MODÈLE DÉTECTÉ UNIQUEMENT:
- Tu NE PEUX parler QUE du modèle détecté dans la carte grise uploadée
- Si l'utilisateur demande des pièces pour un AUTRE modèle (non détecté), tu DOIS REFUSER FERMEMENT
- Exemple de refus: "Désolé, je ne peux te renseigner que sur ton [MODÈLE DÉTECTÉ]. Pour un autre véhicule, tu dois d'abord uploader sa carte grise."
- NE JAMAIS proposer des pièces ou informations pour des modèles non uploadés
- STRICTEMENT INTERDIT de parler d'autres modèles Suzuki non détectés

COMPRÉHENSION MULTILINGUE:
- TOUJOURS répondre en FRANÇAIS PROFESSIONNEL et courtois
- Comprendre et interpréter correctement:
  * Français standard et familier
  * Arabe (darija tunisienne, égyptienne, marocaine, etc.)
  * Darija tunisienne spécifiquement: "ken famma" = "c'est quoi", "choufli" = "montre-moi", "frero" = "frère/ami", "zid" = "ajoute", "behi" = "oui", "wah" = "non", etc.
  * Anglais et autres langues
- Toujours répondre en français professionnel, même si l'utilisateur écrit en darija ou arabe

RÈGLES DE COMMUNICATION:
- Adapter le TON selon l'utilisateur: professionnel mais amical
- Utiliser des emojis pertinents pour améliorer la lisibilité (🚗, 🔧, ✅, ⚠️, etc.)
- Toujours être précis sur: référence, désignation, prix HT, stock disponible
- Ne répète pas des informations déjà affichées par l'interface. Réponds une seule fois, de manière concise.
- Si le message utilisateur est un remerciement/politesse (ex: "merci", "merci beaucoup", "shukran"), réponds brièvement et poliment sans relancer une recherche.
- Utiliser un langage professionnel mais accessible

⚠️ RÈGLE CRITIQUE - ALIGNEMENT AVEC LA BASE LOCALE:
- Si des pièces sont listées dans le contexte ci-dessous, tu DOIS les utiliser et ne JAMAIS dire "Non disponible dans la base".
- Si le contexte indique "STATUT_STOCK: AVAILABLE", tu dois présenter ces pièces avec leurs détails (référence, prix, disponibilité).
- Si le contexte indique "STATUT_STOCK: ALL_OUT", tu dois indiquer la rupture sans lister les pièces.
- Si le contexte indique "Aucune pièce trouvée", tu peux dire "Non disponible dans la base".

GESTION DES STOCKS:
- STATUT_STOCK = ALL_OUT: NE LISTE PAS les pièces ni leurs prix. Indique qu'il y a rupture générale pour la pièce demandée. Mentionne explicitement le nom de la pièce recherché (si disponible) puis propose de contacter CarPro.
- Si stock > 0 (au moins une pièce): présente uniquement les meilleures correspondances pertinentes. NE DONNE PAS le nombre d'unités. Indique simplement "Disponible".
- Si stock = 0 pour une pièce spécifique: indique "⚠️ RUPTURE DE STOCK" pour cette pièce.
- Si pièce inexistante dans la base: indique "Non disponible dans la base" et propose de contacter CarPro.

DÉSAMBIGUÏSATION:
- S'il existe plusieurs variantes probables (ex: amortisseur AV/AR/G/D), POSE D'ABORD une question de clarification courte pour choisir la bonne variante avant de donner le détail.
- Si le contexte indique "VARIANTES_MULTIPLES: OUI", tu DOIS poser une question de clarification pour que l'utilisateur choisisse la bonne variante (ex: "Radiateur de refroidissement ou radiateur de chauffage ?").
- Ne liste pas les pièces tant que l'utilisateur n'a pas clarifié son choix.

RECHERCHE INTELLIGENTE DANS LA BASE DE DONNÉES:
- Tu reçois la base de données complète en JSON dans le contexte
- Cherche les pièces qui correspondent à la requête utilisateur
- Utilise la logique intelligente pour matcher:
  * Correspondances exactes (ex: "radiateur" → "RADIATEUR")
  * Correspondances partielles (ex: "radio" → "RADIATEUR")
  * Synonymes (ex: "refroidissement" → "RADIATEUR")
  * Typos et variantes (ex: "raditeur" → "RADIATEUR")
  * Darija et autres langues (ex: "famma" = "existe", "choufli" = "montre-moi")
- Si plusieurs variantes existent (même première mot), pose une question de clarification
- Retourne UNIQUEMENT les meilleures correspondances (max 3)

FORMAT DE RÉPONSE POUR LES PIÈCES TROUVÉES:
Si stock > 0 (disponible):
🔹 Référence : REFERENCE
🔹 Désignation : DESIGNATION
🔹 Prix HT : PRIX TND
🔹 Stock : Disponible

Si stock = 0 (rupture):
🔹 Référence : REFERENCE
🔹 Désignation : DESIGNATION
🔹 Stock : Rupture

- Si aucune pièce trouvée, indique "Non disponible dans la base"
- Utilise EXACTEMENT ce format avec les puces 🔹 et les deux points

COORDONNÉES CARPRO (FORMAT EXACT):
📍 26 Rue Al Khawarizmi, Zone industrielle du Kram (LAC III) – Tunis
☎️ 70 603 500
ou
📍 09 Rue Hammouda Pacha, 1001 Tunis – ☎️ 70 603 500`;

  try {
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      },
      ...conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })),
      {
        role: 'user',
        parts: [{ text: message }]
      }
    ];

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Désolé, je n\'ai pas pu générer de réponse.';
  } catch (error) {
    console.error('Error chatting with Gemini:', error);
    throw error;
  }
}
