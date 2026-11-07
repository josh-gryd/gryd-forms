// The respondent-facing copy Forms writes itself: buttons, banners, the
// screens around a form (closed, not open yet, password, sign-in) and the
// confirmation email. Validation messages are in i18n.ts. The form's
// `settings.language` picks the catalog; anything the owner typed is shown as
// typed.

import { isFormLanguage, type FormLanguage } from './i18n'

export interface UiCatalog {
  start: string; continue: string; submit: string; back: string; submitting: string; waitingConnection: string
  required: string; pressEnterBefore: string; pressEnterAfter: string; pageOf: (n: number, total: number) => string
  progress: string; formProgress: string; dismiss: string
  offline: string; errorsSummary: (n: number) => string
  failures: Record<'network' | 'busy' | 'moved' | 'closed' | 'gone' | 'duplicate' | 'locked' | 'signin' | 'notOpen', { title: string; body: string }>
  tryAgain: string; reload: string
  versionNotice: (dropped: number) => string
  resumed: string; resumedOlder: string; startOver: string; startOverNew: string; resolving: string
  thanks: string; received: string; redirectingTo: string; theNextPage: string; continueNow: string
  startAgain: string; submitAnother: string
  editResponse: string; editLinkNote: string; copyLink: string; copied: string
  editingBanner: string; saveChanges: string; changesSaved: string; editUnavailable: string
  closed: string; closedDefault: string; closedLimit: string
  opensSoon: string; opensOn: (when: string) => string
  lockedTitle: string; lockedBody: string; password: string; unlock: string; wrongPassword: string
  signinTitle: string; signinBody: string; signin: string; signedInAs: (email: string) => string
  respondedTitle: string; respondedBody: string
  /** Under the email question when a form takes one response per address. */
  onePerEmail: string
  confirmationSubject: (title: string) => string; confirmationIntro: string; yourAnswers: string; changeAnswers: string
  /** Copy inside the fields themselves. */
  fields: FieldsCatalog
}

export interface FieldsCatalog {
  chooseOne: string; on: string; off: string; startDate: string; endDate: string
  cancelUpload: string; removeFile: string; dropToUpload: string; tapToChoose: string; chooseFile: string; orDragHere: string; uploadDropped: (pct: number) => string
  to: string; uploadingPct: (pct: number) => string; uploadingName: (name: string) => string; uploaded: string; remove: string; retry: string; upTo: (mb: number) => string
  street: string; line2: string; city: string; region: string; postal: string; country: string; countryCode: string
  signaturePad: string; signaturePadSigned: string; signHere: string; howToSign: string; draw: string; type: string; typeFullName: string; clear: string; drawHint: string; drawHintType: string
  /** Stands in for the built-in e-signature agreement when the owner kept it. */
  agreement: string
}

const en: UiCatalog = {
  start: 'Start', continue: 'Continue', submit: 'Submit', back: 'Back', submitting: 'Submitting…', waitingConnection: 'Waiting for connection…',
  required: 'Required', pressEnterBefore: 'Press', pressEnterAfter: 'to continue', pageOf: (n, t) => `Page ${n} of ${t}`,
  progress: 'Progress', formProgress: 'Form progress', dismiss: 'Dismiss',
  offline: 'You’re offline. Your answers are saved on this device.',
  errorsSummary: n => (n === 1 ? '1 answer needs attention' : `${n} answers need attention`),
  failures: {
    network: { title: 'We couldn’t send your answers.', body: 'They’re saved on this device — try again.' },
    busy: { title: 'Too many tries in a row.', body: 'Wait a minute, then try again. Your answers are saved on this device.' },
    moved: { title: 'This form was updated while you were answering.', body: 'Reload to carry your answers over — they’re saved on this device.' },
    closed: { title: 'This form stopped accepting responses.', body: 'Your answers weren’t sent.' },
    gone: { title: 'This form is no longer available.', body: 'Your answers weren’t sent.' },
    duplicate: { title: 'You’ve already responded to this form.', body: 'It takes one response per person, so these answers weren’t sent.' },
    locked: { title: 'This form needs its password again.', body: 'Reload and enter it — your answers are saved on this device.' },
    signin: { title: 'Sign in to send your answers.', body: 'Your answers are saved on this device.' },
    notOpen: { title: 'This form isn’t open yet.', body: 'Your answers weren’t sent.' },
  },
  tryAgain: 'Try again', reload: 'Reload',
  versionNotice: d => `This form was updated since you started. ${d === 0 ? 'Your answers were kept.' : d === 1 ? 'Your answers were kept, except one that no longer fits — please answer it again.' : `Your answers were kept, except ${d} that no longer fit — please answer them again.`}`,
  resumed: 'Picked up where you left off.', resumedOlder: 'Picked up where you left off. This form has been updated since you started; you’re finishing the version you began.',
  startOver: 'Start over', startOverNew: 'Start over on the new version', resolving: 'Picking up where you left off…',
  thanks: 'Thanks, we got it.', received: 'RECEIVED', redirectingTo: 'Taking you to', theNextPage: 'the next page', continueNow: 'Continue now',
  startAgain: 'Start again', submitAnother: 'Submit another response',
  editResponse: 'Edit your response', editLinkNote: 'Keep this link to change your answers later.', copyLink: 'Copy link', copied: 'Copied',
  editingBanner: 'You’re changing a response you already sent.', saveChanges: 'Save changes', changesSaved: 'Your changes are saved.', editUnavailable: 'This link can’t be used to change a response any more.',
  closed: 'Closed', closedDefault: 'This form is closed. Thanks for your interest.', closedLimit: 'This form has all the responses it needs. Thanks for your interest.',
  opensSoon: 'Opens soon', opensOn: w => `This form opens on ${w}.`,
  lockedTitle: 'This form is password protected', lockedBody: 'Enter the password you were given to continue.', password: 'Password', unlock: 'Continue', wrongPassword: 'That password isn’t right.',
  signinTitle: 'Sign in to respond', signinBody: 'This form is only open to people who are signed in.', signin: 'Sign in', signedInAs: e => `Signed in as ${e}`,
  respondedTitle: 'You’ve already responded', respondedBody: 'This form takes one response per person.', onePerEmail: 'Each email address can respond once.',
  confirmationSubject: t => `We got your response: ${t}`, confirmationIntro: 'Thanks — we received your response.', yourAnswers: 'Your answers', changeAnswers: 'Change your answers',
  fields: {
    chooseOne: 'Choose one', on: 'On', off: 'Off', startDate: 'Start date', endDate: 'End date',
    cancelUpload: 'Cancel upload', removeFile: 'Remove file', dropToUpload: 'Drop to upload', tapToChoose: 'Tap to choose a file', chooseFile: 'Choose a file', orDragHere: 'or drag it here', uploadDropped: p => `Connection dropped at ${p}%. Nothing else on the form was affected.`,
    to: 'to', uploadingPct: p => `Uploading · ${p}%`, uploadingName: n => `Uploading ${n}`, uploaded: 'Uploaded', remove: 'Remove', retry: 'Retry', upTo: mb => `up to ${mb} MB`,
    street: 'Street address', line2: 'Apartment, suite, etc. (optional)', city: 'City', region: 'State / Region', postal: 'Postal code', country: 'Country', countryCode: 'Country code',
    signaturePad: 'Signature pad', signaturePadSigned: 'Signature pad, signed', signHere: 'Sign here', howToSign: 'How to sign', draw: 'Draw', type: 'Type', typeFullName: 'Type your full name', clear: 'Clear', drawHint: 'Draw with a mouse, finger or stylus.', drawHintType: ' Press Enter to type your name instead.',
    agreement: 'I agree that my electronic signature is as valid as a handwritten one.',
  },
}

const es: UiCatalog = {
  start: 'Empezar', continue: 'Continuar', submit: 'Enviar', back: 'Atrás', submitting: 'Enviando…', waitingConnection: 'Esperando conexión…',
  required: 'Obligatorio', pressEnterBefore: 'Pulsa', pressEnterAfter: 'para continuar', pageOf: (n, t) => `Página ${n} de ${t}`,
  progress: 'Progreso', formProgress: 'Progreso del formulario', dismiss: 'Cerrar',
  offline: 'Estás sin conexión. Tus respuestas se guardan en este dispositivo.',
  errorsSummary: n => (n === 1 ? '1 respuesta necesita atención' : `${n} respuestas necesitan atención`),
  failures: {
    network: { title: 'No pudimos enviar tus respuestas.', body: 'Están guardadas en este dispositivo: inténtalo de nuevo.' },
    busy: { title: 'Demasiados intentos seguidos.', body: 'Espera un minuto e inténtalo de nuevo. Tus respuestas están guardadas en este dispositivo.' },
    moved: { title: 'Este formulario se actualizó mientras respondías.', body: 'Recarga para conservar tus respuestas: están guardadas en este dispositivo.' },
    closed: { title: 'Este formulario ya no acepta respuestas.', body: 'Tus respuestas no se enviaron.' },
    gone: { title: 'Este formulario ya no está disponible.', body: 'Tus respuestas no se enviaron.' },
    duplicate: { title: 'Ya respondiste a este formulario.', body: 'Admite una respuesta por persona, así que estas respuestas no se enviaron.' },
    locked: { title: 'Este formulario necesita de nuevo su contraseña.', body: 'Recarga e introdúcela: tus respuestas están guardadas en este dispositivo.' },
    signin: { title: 'Inicia sesión para enviar tus respuestas.', body: 'Tus respuestas están guardadas en este dispositivo.' },
    notOpen: { title: 'Este formulario aún no está abierto.', body: 'Tus respuestas no se enviaron.' },
  },
  tryAgain: 'Reintentar', reload: 'Recargar',
  versionNotice: d => `Este formulario se actualizó desde que empezaste. ${d === 0 ? 'Se conservaron tus respuestas.' : d === 1 ? 'Se conservaron tus respuestas, salvo una que ya no encaja: respóndela de nuevo.' : `Se conservaron tus respuestas, salvo ${d} que ya no encajan: respóndelas de nuevo.`}`,
  resumed: 'Continúas donde lo dejaste.', resumedOlder: 'Continúas donde lo dejaste. Este formulario se actualizó desde que empezaste; estás terminando la versión que comenzaste.',
  startOver: 'Empezar de nuevo', startOverNew: 'Empezar de nuevo con la versión nueva', resolving: 'Recuperando donde lo dejaste…',
  thanks: 'Gracias, lo hemos recibido.', received: 'RECIBIDO', redirectingTo: 'Te llevamos a', theNextPage: 'la siguiente página', continueNow: 'Continuar ahora',
  startAgain: 'Empezar otra vez', submitAnother: 'Enviar otra respuesta',
  editResponse: 'Editar tu respuesta', editLinkNote: 'Guarda este enlace para cambiar tus respuestas más adelante.', copyLink: 'Copiar enlace', copied: 'Copiado',
  editingBanner: 'Estás cambiando una respuesta que ya enviaste.', saveChanges: 'Guardar cambios', changesSaved: 'Tus cambios están guardados.', editUnavailable: 'Este enlace ya no sirve para cambiar una respuesta.',
  closed: 'Cerrado', closedDefault: 'Este formulario está cerrado. Gracias por tu interés.', closedLimit: 'Este formulario ya tiene todas las respuestas que necesita. Gracias por tu interés.',
  opensSoon: 'Abre pronto', opensOn: w => `Este formulario abre el ${w}.`,
  lockedTitle: 'Este formulario está protegido con contraseña', lockedBody: 'Introduce la contraseña que te dieron para continuar.', password: 'Contraseña', unlock: 'Continuar', wrongPassword: 'Esa contraseña no es correcta.',
  signinTitle: 'Inicia sesión para responder', signinBody: 'Este formulario solo está abierto a personas con sesión iniciada.', signin: 'Iniciar sesión', signedInAs: e => `Sesión iniciada como ${e}`,
  respondedTitle: 'Ya has respondido', respondedBody: 'Este formulario admite una respuesta por persona.', onePerEmail: 'Cada dirección de correo puede responder una vez.',
  confirmationSubject: t => `Recibimos tu respuesta: ${t}`, confirmationIntro: 'Gracias: hemos recibido tu respuesta.', yourAnswers: 'Tus respuestas', changeAnswers: 'Cambiar tus respuestas',
  fields: {
    chooseOne: 'Elige una opción', on: 'Sí', off: 'No', startDate: 'Fecha de inicio', endDate: 'Fecha de fin',
    cancelUpload: 'Cancelar subida', removeFile: 'Quitar archivo', dropToUpload: 'Suelta para subir', tapToChoose: 'Toca para elegir un archivo', chooseFile: 'Elige un archivo', orDragHere: 'o arrástralo aquí', uploadDropped: p => `La conexión se cortó al ${p}%. El resto del formulario no se ha visto afectado.`,
    to: 'a', uploadingPct: p => `Subiendo · ${p}%`, uploadingName: n => `Subiendo ${n}`, uploaded: 'Subido', remove: 'Quitar', retry: 'Reintentar', upTo: mb => `hasta ${mb} MB`,
    street: 'Dirección', line2: 'Piso, puerta, etc. (opcional)', city: 'Ciudad', region: 'Provincia / Región', postal: 'Código postal', country: 'País', countryCode: 'Prefijo del país',
    signaturePad: 'Área de firma', signaturePadSigned: 'Área de firma, firmada', signHere: 'Firma aquí', howToSign: 'Cómo firmar', draw: 'Dibujar', type: 'Escribir', typeFullName: 'Escribe tu nombre completo', clear: 'Borrar', drawHint: 'Dibuja con el ratón, el dedo o un lápiz.', drawHintType: ' Pulsa Intro para escribir tu nombre.',
    agreement: 'Acepto que mi firma electrónica tiene la misma validez que una manuscrita.',
  },
}

const fr: UiCatalog = {
  start: 'Commencer', continue: 'Continuer', submit: 'Envoyer', back: 'Retour', submitting: 'Envoi…', waitingConnection: 'En attente de connexion…',
  required: 'Obligatoire', pressEnterBefore: 'Appuyez sur', pressEnterAfter: 'pour continuer', pageOf: (n, t) => `Page ${n} sur ${t}`,
  progress: 'Progression', formProgress: 'Progression du formulaire', dismiss: 'Fermer',
  offline: 'Vous êtes hors ligne. Vos réponses sont enregistrées sur cet appareil.',
  errorsSummary: n => (n === 1 ? '1 réponse à corriger' : `${n} réponses à corriger`),
  failures: {
    network: { title: 'Nous n’avons pas pu envoyer vos réponses.', body: 'Elles sont enregistrées sur cet appareil — réessayez.' },
    busy: { title: 'Trop de tentatives d’affilée.', body: 'Attendez une minute, puis réessayez. Vos réponses sont enregistrées sur cet appareil.' },
    moved: { title: 'Ce formulaire a été modifié pendant que vous répondiez.', body: 'Rechargez pour reprendre vos réponses — elles sont enregistrées sur cet appareil.' },
    closed: { title: 'Ce formulaire n’accepte plus de réponses.', body: 'Vos réponses n’ont pas été envoyées.' },
    gone: { title: 'Ce formulaire n’est plus disponible.', body: 'Vos réponses n’ont pas été envoyées.' },
    duplicate: { title: 'Vous avez déjà répondu à ce formulaire.', body: 'Il n’accepte qu’une réponse par personne : ces réponses n’ont pas été envoyées.' },
    locked: { title: 'Ce formulaire demande à nouveau son mot de passe.', body: 'Rechargez et saisissez-le — vos réponses sont enregistrées sur cet appareil.' },
    signin: { title: 'Connectez-vous pour envoyer vos réponses.', body: 'Vos réponses sont enregistrées sur cet appareil.' },
    notOpen: { title: 'Ce formulaire n’est pas encore ouvert.', body: 'Vos réponses n’ont pas été envoyées.' },
  },
  tryAgain: 'Réessayer', reload: 'Recharger',
  versionNotice: d => `Ce formulaire a été modifié depuis que vous avez commencé. ${d === 0 ? 'Vos réponses ont été conservées.' : d === 1 ? 'Vos réponses ont été conservées, sauf une qui ne convient plus — répondez-y à nouveau.' : `Vos réponses ont été conservées, sauf ${d} qui ne conviennent plus — répondez-y à nouveau.`}`,
  resumed: 'Vous reprenez là où vous vous étiez arrêté.', resumedOlder: 'Vous reprenez là où vous vous étiez arrêté. Ce formulaire a changé depuis ; vous terminez la version commencée.',
  startOver: 'Recommencer', startOverNew: 'Recommencer avec la nouvelle version', resolving: 'Reprise de vos réponses…',
  thanks: 'Merci, c’est bien reçu.', received: 'REÇU', redirectingTo: 'Redirection vers', theNextPage: 'la page suivante', continueNow: 'Continuer maintenant',
  startAgain: 'Recommencer', submitAnother: 'Envoyer une autre réponse',
  editResponse: 'Modifier votre réponse', editLinkNote: 'Gardez ce lien pour modifier vos réponses plus tard.', copyLink: 'Copier le lien', copied: 'Copié',
  editingBanner: 'Vous modifiez une réponse déjà envoyée.', saveChanges: 'Enregistrer', changesSaved: 'Vos modifications sont enregistrées.', editUnavailable: 'Ce lien ne permet plus de modifier une réponse.',
  closed: 'Fermé', closedDefault: 'Ce formulaire est fermé. Merci de votre intérêt.', closedLimit: 'Ce formulaire a reçu toutes les réponses nécessaires. Merci de votre intérêt.',
  opensSoon: 'Bientôt ouvert', opensOn: w => `Ce formulaire ouvre le ${w}.`,
  lockedTitle: 'Ce formulaire est protégé par un mot de passe', lockedBody: 'Saisissez le mot de passe qui vous a été communiqué.', password: 'Mot de passe', unlock: 'Continuer', wrongPassword: 'Ce mot de passe est incorrect.',
  signinTitle: 'Connectez-vous pour répondre', signinBody: 'Ce formulaire est réservé aux personnes connectées.', signin: 'Se connecter', signedInAs: e => `Connecté en tant que ${e}`,
  respondedTitle: 'Vous avez déjà répondu', respondedBody: 'Ce formulaire n’accepte qu’une réponse par personne.', onePerEmail: 'Chaque adresse e-mail ne peut répondre qu’une fois.',
  confirmationSubject: t => `Nous avons reçu votre réponse : ${t}`, confirmationIntro: 'Merci — nous avons bien reçu votre réponse.', yourAnswers: 'Vos réponses', changeAnswers: 'Modifier vos réponses',
  fields: {
    chooseOne: 'Choisissez une option', on: 'Oui', off: 'Non', startDate: 'Date de début', endDate: 'Date de fin',
    cancelUpload: 'Annuler l’envoi', removeFile: 'Retirer le fichier', dropToUpload: 'Déposez pour envoyer', tapToChoose: 'Touchez pour choisir un fichier', chooseFile: 'Choisissez un fichier', orDragHere: 'ou glissez-le ici', uploadDropped: p => `La connexion a été coupée à ${p} %. Le reste du formulaire n’est pas touché.`,
    to: 'au', uploadingPct: p => `Envoi · ${p} %`, uploadingName: n => `Envoi de ${n}`, uploaded: 'Envoyé', remove: 'Retirer', retry: 'Réessayer', upTo: mb => `jusqu’à ${mb} Mo`,
    street: 'Adresse', line2: 'Appartement, bâtiment, etc. (facultatif)', city: 'Ville', region: 'Région', postal: 'Code postal', country: 'Pays', countryCode: 'Indicatif du pays',
    signaturePad: 'Zone de signature', signaturePadSigned: 'Zone de signature, signée', signHere: 'Signez ici', howToSign: 'Comment signer', draw: 'Dessiner', type: 'Saisir', typeFullName: 'Saisissez votre nom complet', clear: 'Effacer', drawHint: 'Dessinez avec la souris, le doigt ou un stylet.', drawHintType: ' Appuyez sur Entrée pour saisir votre nom.',
    agreement: 'J’accepte que ma signature électronique ait la même valeur qu’une signature manuscrite.',
  },
}

const de: UiCatalog = {
  start: 'Starten', continue: 'Weiter', submit: 'Absenden', back: 'Zurück', submitting: 'Wird gesendet…', waitingConnection: 'Warte auf Verbindung…',
  required: 'Pflichtfeld', pressEnterBefore: 'Drücken Sie', pressEnterAfter: 'um fortzufahren', pageOf: (n, t) => `Seite ${n} von ${t}`,
  progress: 'Fortschritt', formProgress: 'Formularfortschritt', dismiss: 'Schließen',
  offline: 'Sie sind offline. Ihre Antworten sind auf diesem Gerät gespeichert.',
  errorsSummary: n => (n === 1 ? '1 Antwort braucht Ihre Aufmerksamkeit' : `${n} Antworten brauchen Ihre Aufmerksamkeit`),
  failures: {
    network: { title: 'Wir konnten Ihre Antworten nicht senden.', body: 'Sie sind auf diesem Gerät gespeichert — versuchen Sie es erneut.' },
    busy: { title: 'Zu viele Versuche hintereinander.', body: 'Warten Sie eine Minute und versuchen Sie es erneut. Ihre Antworten sind auf diesem Gerät gespeichert.' },
    moved: { title: 'Dieses Formular wurde geändert, während Sie antworteten.', body: 'Laden Sie neu, um Ihre Antworten zu übernehmen — sie sind auf diesem Gerät gespeichert.' },
    closed: { title: 'Dieses Formular nimmt keine Antworten mehr an.', body: 'Ihre Antworten wurden nicht gesendet.' },
    gone: { title: 'Dieses Formular ist nicht mehr verfügbar.', body: 'Ihre Antworten wurden nicht gesendet.' },
    duplicate: { title: 'Sie haben dieses Formular bereits beantwortet.', body: 'Es nimmt eine Antwort pro Person an, daher wurden diese Antworten nicht gesendet.' },
    locked: { title: 'Dieses Formular braucht erneut sein Passwort.', body: 'Laden Sie neu und geben Sie es ein — Ihre Antworten sind auf diesem Gerät gespeichert.' },
    signin: { title: 'Melden Sie sich an, um Ihre Antworten zu senden.', body: 'Ihre Antworten sind auf diesem Gerät gespeichert.' },
    notOpen: { title: 'Dieses Formular ist noch nicht geöffnet.', body: 'Ihre Antworten wurden nicht gesendet.' },
  },
  tryAgain: 'Erneut versuchen', reload: 'Neu laden',
  versionNotice: d => `Dieses Formular wurde geändert, seit Sie begonnen haben. ${d === 0 ? 'Ihre Antworten wurden übernommen.' : d === 1 ? 'Ihre Antworten wurden übernommen, bis auf eine, die nicht mehr passt — bitte beantworten Sie sie erneut.' : `Ihre Antworten wurden übernommen, bis auf ${d}, die nicht mehr passen — bitte beantworten Sie sie erneut.`}`,
  resumed: 'Sie machen dort weiter, wo Sie aufgehört haben.', resumedOlder: 'Sie machen dort weiter, wo Sie aufgehört haben. Das Formular wurde inzwischen geändert; Sie beenden die Version, die Sie begonnen haben.',
  startOver: 'Neu beginnen', startOverNew: 'Mit der neuen Version neu beginnen', resolving: 'Ihre Antworten werden geladen…',
  thanks: 'Danke, ist angekommen.', received: 'ERHALTEN', redirectingTo: 'Weiter zu', theNextPage: 'der nächsten Seite', continueNow: 'Jetzt weiter',
  startAgain: 'Noch einmal', submitAnother: 'Weitere Antwort senden',
  editResponse: 'Antwort bearbeiten', editLinkNote: 'Bewahren Sie diesen Link auf, um Ihre Antworten später zu ändern.', copyLink: 'Link kopieren', copied: 'Kopiert',
  editingBanner: 'Sie ändern eine bereits gesendete Antwort.', saveChanges: 'Änderungen speichern', changesSaved: 'Ihre Änderungen sind gespeichert.', editUnavailable: 'Mit diesem Link lässt sich keine Antwort mehr ändern.',
  closed: 'Geschlossen', closedDefault: 'Dieses Formular ist geschlossen. Danke für Ihr Interesse.', closedLimit: 'Dieses Formular hat alle nötigen Antworten erhalten. Danke für Ihr Interesse.',
  opensSoon: 'Öffnet bald', opensOn: w => `Dieses Formular öffnet am ${w}.`,
  lockedTitle: 'Dieses Formular ist passwortgeschützt', lockedBody: 'Geben Sie das Passwort ein, das Sie erhalten haben.', password: 'Passwort', unlock: 'Weiter', wrongPassword: 'Das Passwort ist nicht richtig.',
  signinTitle: 'Zum Antworten anmelden', signinBody: 'Dieses Formular ist nur für Personen geöffnet, die angemeldet sind.', signin: 'Anmelden', signedInAs: e => `Angemeldet als ${e}`,
  respondedTitle: 'Sie haben bereits geantwortet', respondedBody: 'Dieses Formular nimmt eine Antwort pro Person an.', onePerEmail: 'Jede E-Mail-Adresse kann einmal antworten.',
  confirmationSubject: t => `Ihre Antwort ist angekommen: ${t}`, confirmationIntro: 'Danke — wir haben Ihre Antwort erhalten.', yourAnswers: 'Ihre Antworten', changeAnswers: 'Antworten ändern',
  fields: {
    chooseOne: 'Bitte auswählen', on: 'An', off: 'Aus', startDate: 'Startdatum', endDate: 'Enddatum',
    cancelUpload: 'Upload abbrechen', removeFile: 'Datei entfernen', dropToUpload: 'Zum Hochladen ablegen', tapToChoose: 'Tippen, um eine Datei zu wählen', chooseFile: 'Datei wählen', orDragHere: 'oder hierher ziehen', uploadDropped: p => `Die Verbindung brach bei ${p} % ab. Der Rest des Formulars ist nicht betroffen.`,
    to: 'bis', uploadingPct: p => `Wird hochgeladen · ${p} %`, uploadingName: n => `${n} wird hochgeladen`, uploaded: 'Hochgeladen', remove: 'Entfernen', retry: 'Erneut versuchen', upTo: mb => `bis ${mb} MB`,
    street: 'Straße und Hausnummer', line2: 'Wohnung, Etage usw. (optional)', city: 'Stadt', region: 'Bundesland / Region', postal: 'Postleitzahl', country: 'Land', countryCode: 'Ländervorwahl',
    signaturePad: 'Unterschriftenfeld', signaturePadSigned: 'Unterschriftenfeld, unterschrieben', signHere: 'Hier unterschreiben', howToSign: 'Wie unterschreiben', draw: 'Zeichnen', type: 'Tippen', typeFullName: 'Vollständigen Namen eingeben', clear: 'Löschen', drawHint: 'Mit Maus, Finger oder Stift zeichnen.', drawHintType: ' Drücken Sie die Eingabetaste, um stattdessen Ihren Namen zu tippen.',
    agreement: 'Ich stimme zu, dass meine elektronische Unterschrift genauso gültig ist wie eine handschriftliche.',
  },
}

const pt: UiCatalog = {
  start: 'Começar', continue: 'Continuar', submit: 'Enviar', back: 'Voltar', submitting: 'A enviar…', waitingConnection: 'À espera de ligação…',
  required: 'Obrigatório', pressEnterBefore: 'Prima', pressEnterAfter: 'para continuar', pageOf: (n, t) => `Página ${n} de ${t}`,
  progress: 'Progresso', formProgress: 'Progresso do formulário', dismiss: 'Fechar',
  offline: 'Está sem ligação. As suas respostas ficam guardadas neste dispositivo.',
  errorsSummary: n => (n === 1 ? '1 resposta precisa de atenção' : `${n} respostas precisam de atenção`),
  failures: {
    network: { title: 'Não conseguimos enviar as suas respostas.', body: 'Estão guardadas neste dispositivo — tente novamente.' },
    busy: { title: 'Demasiadas tentativas seguidas.', body: 'Aguarde um minuto e tente novamente. As suas respostas estão guardadas neste dispositivo.' },
    moved: { title: 'Este formulário foi atualizado enquanto respondia.', body: 'Recarregue para manter as suas respostas — estão guardadas neste dispositivo.' },
    closed: { title: 'Este formulário deixou de aceitar respostas.', body: 'As suas respostas não foram enviadas.' },
    gone: { title: 'Este formulário já não está disponível.', body: 'As suas respostas não foram enviadas.' },
    duplicate: { title: 'Já respondeu a este formulário.', body: 'Aceita uma resposta por pessoa, por isso estas respostas não foram enviadas.' },
    locked: { title: 'Este formulário precisa novamente da palavra-passe.', body: 'Recarregue e introduza-a — as suas respostas estão guardadas neste dispositivo.' },
    signin: { title: 'Inicie sessão para enviar as suas respostas.', body: 'As suas respostas estão guardadas neste dispositivo.' },
    notOpen: { title: 'Este formulário ainda não está aberto.', body: 'As suas respostas não foram enviadas.' },
  },
  tryAgain: 'Tentar novamente', reload: 'Recarregar',
  versionNotice: d => `Este formulário foi atualizado desde que começou. ${d === 0 ? 'As suas respostas foram mantidas.' : d === 1 ? 'As suas respostas foram mantidas, exceto uma que já não se aplica — responda-lhe novamente.' : `As suas respostas foram mantidas, exceto ${d} que já não se aplicam — responda-lhes novamente.`}`,
  resumed: 'Continua onde ficou.', resumedOlder: 'Continua onde ficou. Este formulário foi atualizado desde que começou; está a terminar a versão que iniciou.',
  startOver: 'Recomeçar', startOverNew: 'Recomeçar na nova versão', resolving: 'A retomar onde ficou…',
  thanks: 'Obrigado, recebemos.', received: 'RECEBIDO', redirectingTo: 'A levá-lo para', theNextPage: 'a página seguinte', continueNow: 'Continuar agora',
  startAgain: 'Começar de novo', submitAnother: 'Enviar outra resposta',
  editResponse: 'Editar a sua resposta', editLinkNote: 'Guarde este link para alterar as suas respostas mais tarde.', copyLink: 'Copiar link', copied: 'Copiado',
  editingBanner: 'Está a alterar uma resposta que já enviou.', saveChanges: 'Guardar alterações', changesSaved: 'As suas alterações foram guardadas.', editUnavailable: 'Este link já não pode ser usado para alterar uma resposta.',
  closed: 'Fechado', closedDefault: 'Este formulário está fechado. Obrigado pelo seu interesse.', closedLimit: 'Este formulário já tem todas as respostas de que precisa. Obrigado pelo seu interesse.',
  opensSoon: 'Abre em breve', opensOn: w => `Este formulário abre a ${w}.`,
  lockedTitle: 'Este formulário está protegido por palavra-passe', lockedBody: 'Introduza a palavra-passe que recebeu para continuar.', password: 'Palavra-passe', unlock: 'Continuar', wrongPassword: 'Essa palavra-passe não está correta.',
  signinTitle: 'Inicie sessão para responder', signinBody: 'Este formulário só está aberto a quem tem sessão iniciada.', signin: 'Iniciar sessão', signedInAs: e => `Sessão iniciada como ${e}`,
  respondedTitle: 'Já respondeu', respondedBody: 'Este formulário aceita uma resposta por pessoa.', onePerEmail: 'Cada endereço de e-mail pode responder uma vez.',
  confirmationSubject: t => `Recebemos a sua resposta: ${t}`, confirmationIntro: 'Obrigado — recebemos a sua resposta.', yourAnswers: 'As suas respostas', changeAnswers: 'Alterar as suas respostas',
  fields: {
    chooseOne: 'Escolha uma opção', on: 'Sim', off: 'Não', startDate: 'Data de início', endDate: 'Data de fim',
    cancelUpload: 'Cancelar envio', removeFile: 'Remover ficheiro', dropToUpload: 'Largue para enviar', tapToChoose: 'Toque para escolher um ficheiro', chooseFile: 'Escolha um ficheiro', orDragHere: 'ou arraste-o para aqui', uploadDropped: p => `A ligação caiu aos ${p}%. O resto do formulário não foi afetado.`,
    to: 'a', uploadingPct: p => `A enviar · ${p}%`, uploadingName: n => `A enviar ${n}`, uploaded: 'Enviado', remove: 'Remover', retry: 'Tentar novamente', upTo: mb => `até ${mb} MB`,
    street: 'Morada', line2: 'Andar, porta, etc. (opcional)', city: 'Cidade', region: 'Distrito / Região', postal: 'Código postal', country: 'País', countryCode: 'Indicativo do país',
    signaturePad: 'Área de assinatura', signaturePadSigned: 'Área de assinatura, assinada', signHere: 'Assine aqui', howToSign: 'Como assinar', draw: 'Desenhar', type: 'Escrever', typeFullName: 'Escreva o seu nome completo', clear: 'Limpar', drawHint: 'Desenhe com o rato, o dedo ou uma caneta.', drawHintType: ' Prima Enter para escrever o seu nome.',
    agreement: 'Aceito que a minha assinatura eletrónica tem a mesma validade que uma manuscrita.',
  },
}

const it: UiCatalog = {
  start: 'Inizia', continue: 'Continua', submit: 'Invia', back: 'Indietro', submitting: 'Invio in corso…', waitingConnection: 'In attesa di connessione…',
  required: 'Obbligatorio', pressEnterBefore: 'Premi', pressEnterAfter: 'per continuare', pageOf: (n, t) => `Pagina ${n} di ${t}`,
  progress: 'Avanzamento', formProgress: 'Avanzamento del modulo', dismiss: 'Chiudi',
  offline: 'Sei offline. Le tue risposte sono salvate su questo dispositivo.',
  errorsSummary: n => (n === 1 ? '1 risposta richiede attenzione' : `${n} risposte richiedono attenzione`),
  failures: {
    network: { title: 'Non siamo riusciti a inviare le tue risposte.', body: 'Sono salvate su questo dispositivo: riprova.' },
    busy: { title: 'Troppi tentativi di fila.', body: 'Aspetta un minuto e riprova. Le tue risposte sono salvate su questo dispositivo.' },
    moved: { title: 'Questo modulo è stato aggiornato mentre rispondevi.', body: 'Ricarica per mantenere le tue risposte: sono salvate su questo dispositivo.' },
    closed: { title: 'Questo modulo non accetta più risposte.', body: 'Le tue risposte non sono state inviate.' },
    gone: { title: 'Questo modulo non è più disponibile.', body: 'Le tue risposte non sono state inviate.' },
    duplicate: { title: 'Hai già risposto a questo modulo.', body: 'Accetta una risposta a persona, quindi queste risposte non sono state inviate.' },
    locked: { title: 'Questo modulo richiede di nuovo la password.', body: 'Ricarica e inseriscila: le tue risposte sono salvate su questo dispositivo.' },
    signin: { title: 'Accedi per inviare le tue risposte.', body: 'Le tue risposte sono salvate su questo dispositivo.' },
    notOpen: { title: 'Questo modulo non è ancora aperto.', body: 'Le tue risposte non sono state inviate.' },
  },
  tryAgain: 'Riprova', reload: 'Ricarica',
  versionNotice: d => `Questo modulo è stato aggiornato da quando hai iniziato. ${d === 0 ? 'Le tue risposte sono state mantenute.' : d === 1 ? 'Le tue risposte sono state mantenute, tranne una che non è più valida: rispondi di nuovo.' : `Le tue risposte sono state mantenute, tranne ${d} che non sono più valide: rispondi di nuovo.`}`,
  resumed: 'Riprendi da dove avevi lasciato.', resumedOlder: 'Riprendi da dove avevi lasciato. Il modulo è stato aggiornato nel frattempo; stai completando la versione che avevi iniziato.',
  startOver: 'Ricomincia', startOverNew: 'Ricomincia con la nuova versione', resolving: 'Recupero delle tue risposte…',
  thanks: 'Grazie, ricevuto.', received: 'RICEVUTO', redirectingTo: 'Ti portiamo a', theNextPage: 'la pagina successiva', continueNow: 'Continua ora',
  startAgain: 'Ricomincia', submitAnother: 'Invia un’altra risposta',
  editResponse: 'Modifica la tua risposta', editLinkNote: 'Conserva questo link per modificare le risposte in seguito.', copyLink: 'Copia link', copied: 'Copiato',
  editingBanner: 'Stai modificando una risposta già inviata.', saveChanges: 'Salva modifiche', changesSaved: 'Le modifiche sono salvate.', editUnavailable: 'Questo link non può più essere usato per modificare una risposta.',
  closed: 'Chiuso', closedDefault: 'Questo modulo è chiuso. Grazie per l’interesse.', closedLimit: 'Questo modulo ha raccolto tutte le risposte necessarie. Grazie per l’interesse.',
  opensSoon: 'Apre presto', opensOn: w => `Questo modulo apre il ${w}.`,
  lockedTitle: 'Questo modulo è protetto da password', lockedBody: 'Inserisci la password che hai ricevuto per continuare.', password: 'Password', unlock: 'Continua', wrongPassword: 'La password non è corretta.',
  signinTitle: 'Accedi per rispondere', signinBody: 'Questo modulo è aperto solo a chi ha effettuato l’accesso.', signin: 'Accedi', signedInAs: e => `Accesso effettuato come ${e}`,
  respondedTitle: 'Hai già risposto', respondedBody: 'Questo modulo accetta una risposta a persona.', onePerEmail: 'Ogni indirizzo email può rispondere una sola volta.',
  confirmationSubject: t => `Abbiamo ricevuto la tua risposta: ${t}`, confirmationIntro: 'Grazie, abbiamo ricevuto la tua risposta.', yourAnswers: 'Le tue risposte', changeAnswers: 'Modifica le tue risposte',
  fields: {
    chooseOne: 'Scegli un’opzione', on: 'Sì', off: 'No', startDate: 'Data di inizio', endDate: 'Data di fine',
    cancelUpload: 'Annulla caricamento', removeFile: 'Rimuovi file', dropToUpload: 'Rilascia per caricare', tapToChoose: 'Tocca per scegliere un file', chooseFile: 'Scegli un file', orDragHere: 'o trascinalo qui', uploadDropped: p => `La connessione si è interrotta al ${p}%. Il resto del modulo non è stato toccato.`,
    to: 'al', uploadingPct: p => `Caricamento · ${p}%`, uploadingName: n => `Caricamento di ${n}`, uploaded: 'Caricato', remove: 'Rimuovi', retry: 'Riprova', upTo: mb => `fino a ${mb} MB`,
    street: 'Indirizzo', line2: 'Interno, scala, ecc. (facoltativo)', city: 'Città', region: 'Provincia / Regione', postal: 'CAP', country: 'Paese', countryCode: 'Prefisso internazionale',
    signaturePad: 'Area firma', signaturePadSigned: 'Area firma, firmata', signHere: 'Firma qui', howToSign: 'Come firmare', draw: 'Disegna', type: 'Scrivi', typeFullName: 'Scrivi il tuo nome completo', clear: 'Cancella', drawHint: 'Disegna con il mouse, il dito o una penna.', drawHintType: ' Premi Invio per scrivere il tuo nome.',
    agreement: 'Accetto che la mia firma elettronica abbia lo stesso valore di una firma autografa.',
  },
}

const nl: UiCatalog = {
  start: 'Beginnen', continue: 'Verder', submit: 'Versturen', back: 'Terug', submitting: 'Bezig met versturen…', waitingConnection: 'Wachten op verbinding…',
  required: 'Verplicht', pressEnterBefore: 'Druk op', pressEnterAfter: 'om verder te gaan', pageOf: (n, t) => `Pagina ${n} van ${t}`,
  progress: 'Voortgang', formProgress: 'Voortgang van het formulier', dismiss: 'Sluiten',
  offline: 'Je bent offline. Je antwoorden zijn op dit apparaat bewaard.',
  errorsSummary: n => (n === 1 ? '1 antwoord heeft aandacht nodig' : `${n} antwoorden hebben aandacht nodig`),
  failures: {
    network: { title: 'We konden je antwoorden niet versturen.', body: 'Ze zijn op dit apparaat bewaard — probeer het opnieuw.' },
    busy: { title: 'Te veel pogingen achter elkaar.', body: 'Wacht een minuut en probeer het opnieuw. Je antwoorden zijn op dit apparaat bewaard.' },
    moved: { title: 'Dit formulier is bijgewerkt terwijl je antwoordde.', body: 'Laad opnieuw om je antwoorden mee te nemen — ze zijn op dit apparaat bewaard.' },
    closed: { title: 'Dit formulier neemt geen antwoorden meer aan.', body: 'Je antwoorden zijn niet verstuurd.' },
    gone: { title: 'Dit formulier is niet meer beschikbaar.', body: 'Je antwoorden zijn niet verstuurd.' },
    duplicate: { title: 'Je hebt dit formulier al ingevuld.', body: 'Het neemt één antwoord per persoon aan, dus deze antwoorden zijn niet verstuurd.' },
    locked: { title: 'Dit formulier vraagt opnieuw om het wachtwoord.', body: 'Laad opnieuw en vul het in — je antwoorden zijn op dit apparaat bewaard.' },
    signin: { title: 'Log in om je antwoorden te versturen.', body: 'Je antwoorden zijn op dit apparaat bewaard.' },
    notOpen: { title: 'Dit formulier is nog niet open.', body: 'Je antwoorden zijn niet verstuurd.' },
  },
  tryAgain: 'Opnieuw proberen', reload: 'Opnieuw laden',
  versionNotice: d => `Dit formulier is bijgewerkt sinds je begon. ${d === 0 ? 'Je antwoorden zijn bewaard.' : d === 1 ? 'Je antwoorden zijn bewaard, op één na die niet meer past — beantwoord die opnieuw.' : `Je antwoorden zijn bewaard, op ${d} na die niet meer passen — beantwoord die opnieuw.`}`,
  resumed: 'Je gaat verder waar je gebleven was.', resumedOlder: 'Je gaat verder waar je gebleven was. Dit formulier is intussen bijgewerkt; je maakt de versie af waarmee je begon.',
  startOver: 'Opnieuw beginnen', startOverNew: 'Opnieuw beginnen met de nieuwe versie', resolving: 'Je antwoorden worden opgehaald…',
  thanks: 'Bedankt, we hebben het ontvangen.', received: 'ONTVANGEN', redirectingTo: 'We sturen je door naar', theNextPage: 'de volgende pagina', continueNow: 'Nu verder',
  startAgain: 'Opnieuw', submitAnother: 'Nog een antwoord versturen',
  editResponse: 'Je antwoord bewerken', editLinkNote: 'Bewaar deze link om je antwoorden later te wijzigen.', copyLink: 'Link kopiëren', copied: 'Gekopieerd',
  editingBanner: 'Je wijzigt een antwoord dat je al verstuurde.', saveChanges: 'Wijzigingen opslaan', changesSaved: 'Je wijzigingen zijn opgeslagen.', editUnavailable: 'Met deze link kun je geen antwoord meer wijzigen.',
  closed: 'Gesloten', closedDefault: 'Dit formulier is gesloten. Bedankt voor je interesse.', closedLimit: 'Dit formulier heeft alle antwoorden die het nodig heeft. Bedankt voor je interesse.',
  opensSoon: 'Gaat binnenkort open', opensOn: w => `Dit formulier gaat open op ${w}.`,
  lockedTitle: 'Dit formulier is beveiligd met een wachtwoord', lockedBody: 'Vul het wachtwoord in dat je hebt gekregen.', password: 'Wachtwoord', unlock: 'Verder', wrongPassword: 'Dat wachtwoord klopt niet.',
  signinTitle: 'Log in om te antwoorden', signinBody: 'Dit formulier staat alleen open voor mensen die zijn ingelogd.', signin: 'Inloggen', signedInAs: e => `Ingelogd als ${e}`,
  respondedTitle: 'Je hebt al geantwoord', respondedBody: 'Dit formulier neemt één antwoord per persoon aan.', onePerEmail: 'Elk e-mailadres kan één keer antwoorden.',
  confirmationSubject: t => `We hebben je antwoord ontvangen: ${t}`, confirmationIntro: 'Bedankt — we hebben je antwoord ontvangen.', yourAnswers: 'Je antwoorden', changeAnswers: 'Je antwoorden wijzigen',
  fields: {
    chooseOne: 'Kies een optie', on: 'Aan', off: 'Uit', startDate: 'Begindatum', endDate: 'Einddatum',
    cancelUpload: 'Upload annuleren', removeFile: 'Bestand verwijderen', dropToUpload: 'Loslaten om te uploaden', tapToChoose: 'Tik om een bestand te kiezen', chooseFile: 'Kies een bestand', orDragHere: 'of sleep het hierheen', uploadDropped: p => `De verbinding viel weg bij ${p}%. De rest van het formulier is niet geraakt.`,
    to: 'tot', uploadingPct: p => `Bezig met uploaden · ${p}%`, uploadingName: n => `${n} wordt geüpload`, uploaded: 'Geüpload', remove: 'Verwijderen', retry: 'Opnieuw', upTo: mb => `tot ${mb} MB`,
    street: 'Straat en huisnummer', line2: 'Appartement, verdieping, enz. (optioneel)', city: 'Plaats', region: 'Provincie / regio', postal: 'Postcode', country: 'Land', countryCode: 'Landcode',
    signaturePad: 'Handtekeningvak', signaturePadSigned: 'Handtekeningvak, ondertekend', signHere: 'Hier tekenen', howToSign: 'Hoe te ondertekenen', draw: 'Tekenen', type: 'Typen', typeFullName: 'Typ je volledige naam', clear: 'Wissen', drawHint: 'Teken met een muis, vinger of stylus.', drawHintType: ' Druk op Enter om je naam te typen.',
    agreement: 'Ik ga ermee akkoord dat mijn elektronische handtekening even geldig is als een handgeschreven.',
  },
}

export const UI_CATALOGS: Record<FormLanguage, UiCatalog> = { en, es, fr, de, pt, it, nl }

export function uiFor(lang: unknown): UiCatalog {
  return UI_CATALOGS[isFormLanguage(lang) ? lang : 'en']
}

/** The stock thank-you title, in any language: it follows the form's language. A title the author wrote stays as written. */
export function isStockThanks(title: string): boolean {
  const t = title.trim()
  return Object.values(UI_CATALOGS).some(c => c.thanks === t)
}

/** An instant as respondents see it: the form's language, in its time zone. */
export function formatWhen(iso: string, lang: unknown, timeZone: string): string {
  const locale = isFormLanguage(lang) ? lang : 'en'
  try { return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' }).format(new Date(iso)) } catch { return new Date(iso).toUTCString() }
}
