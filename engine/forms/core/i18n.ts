// The words Forms says to a respondent on the owner's behalf: validation
// messages here, the runner's buttons and banners in ui.ts. An owner writes
// questions in any language; the form's `settings.language` picks which of
// these catalogs the built-in copy comes from.
//
// Validation runs synchronously, so `withLanguage` can scope the language for
// one call without threading it through every component: `ERR` and
// `requiredMessage` read whichever catalog is active.

import type { ComponentType } from './schema'
import type { AcceptKind } from './components/upload'

export type FormLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'nl'

export const FORM_LANGUAGES: ReadonlyArray<{ code: FormLanguage; name: string; native: string }> = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
]

export function isFormLanguage(v: unknown): v is FormLanguage {
  return typeof v === 'string' && FORM_LANGUAGES.some(l => l.code === v)
}

export interface ErrorCatalog {
  invalidEmail: string
  invalidPhone: string
  phoneMissing: string
  invalidNumber: string
  invalidUrl: string
  uploadRequired: string
  uploadFailed: string
  uploadBusy: string
  minLength: (n: number) => string
  maxLength: (n: number) => string
  minNumber: (n: number) => string
  maxNumber: (n: number) => string
  integer: string
  minSelections: (n: number) => string
  maxSelections: (n: number) => string
  invalidDate: string
  minDate: (d: string) => string
  maxDate: (d: string) => string
  futureOnly: string
  pastOnly: string
  rangeOrder: string
  fileType: (allowed: string) => string
  fileSize: (mb: number) => string
  tooManyFiles: (n: number) => string
  workEmail: string
  invalidOption: string
  invalidTime: string
  addressIncomplete: string
  signatureTooShort: string
  signatureTypeName: string
  /** The form takes one response per email address, and this one has responded. */
  duplicateEmail: string
  /** A required answer with no message of its own. */
  requiredGeneric: string
  /** A required question whose label is itself a question. */
  requiredQuestion: string
  requiredByType: Partial<Record<ComponentType, string>>
  acceptLabel: Record<AcceptKind, string>
}

const en: ErrorCatalog = {
  invalidEmail: 'That doesn’t look like an email address — check for a typo.',
  invalidPhone: 'Enter a phone number with at least 7 digits.',
  phoneMissing: 'Enter a phone number.',
  invalidNumber: 'Numbers only, please.',
  invalidUrl: 'Enter a full address starting with https://',
  uploadRequired: 'Add a file to continue.',
  uploadFailed: 'This file didn’t upload. Retry or remove it.',
  uploadBusy: 'Wait for the upload to finish.',
  minLength: n => `Use at least ${n} characters.`,
  maxLength: n => `Keep it under ${n} characters.`,
  minNumber: n => `Enter a number of at least ${n}.`,
  maxNumber: n => `Enter a number no more than ${n}.`,
  integer: 'Whole numbers only.',
  minSelections: n => `Choose at least ${n}.`,
  maxSelections: n => `Choose up to ${n}.`,
  invalidDate: 'Enter a valid date.',
  minDate: d => `Choose a date on or after ${d}.`,
  maxDate: d => `Choose a date on or before ${d}.`,
  futureOnly: 'Choose a date in the future.',
  pastOnly: 'Choose a date in the past.',
  rangeOrder: 'The end date has to be after the start date.',
  fileType: a => `That file type isn’t accepted here. Try ${a}.`,
  fileSize: mb => `Files need to be under ${mb} MB.`,
  tooManyFiles: n => `You can add up to ${n} file${n === 1 ? '' : 's'}.`,
  workEmail: 'Use a work email address (not gmail, outlook, yahoo…).',
  invalidOption: 'Choose one of the listed options.',
  invalidTime: 'Enter a valid time.',
  addressIncomplete: 'Enter at least a street address and a city.',
  signatureTooShort: 'Draw your full signature.',
  signatureTypeName: 'Type your full name to sign.',
  duplicateEmail: 'This email address has already been used to respond.',
  requiredGeneric: 'This answer is required.',
  requiredQuestion: 'This one needs an answer.',
  requiredByType: {
    email: 'Enter your email address.', phone: 'Enter a phone number.', dropdown: 'Choose one option.', choice: 'Choose one option.', picture: 'Choose one option.',
    checks: 'Choose at least one.', yesno: 'Choose yes or no.', switch: 'Turn this on to continue.', rating: 'Pick a rating.', scale: 'Pick a number.', long: 'This one needs an answer.',
    number: 'Enter a number.', date: 'Enter a date.', datetime: 'Enter a date and time.', time: 'Enter a time.', daterange: 'Enter both dates.', upload: 'Add a file to continue.',
    url: 'Enter a web address.', ranking: 'Rank the options to continue.', matrix: 'Answer every row.', address: 'Enter your address.', signature: 'Add your signature to continue.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX, PNG', docs: 'PDF or DOCX', images: 'PNG or JPG', any: 'a different file' },
}

const es: ErrorCatalog = {
  invalidEmail: 'Eso no parece una dirección de correo. Revisa si hay un error.',
  invalidPhone: 'Introduce un número de teléfono de al menos 7 dígitos.',
  phoneMissing: 'Introduce un número de teléfono.',
  invalidNumber: 'Solo números, por favor.',
  invalidUrl: 'Introduce una dirección completa que empiece por https://',
  uploadRequired: 'Añade un archivo para continuar.',
  uploadFailed: 'Este archivo no se subió. Vuelve a intentarlo o quítalo.',
  uploadBusy: 'Espera a que termine la subida.',
  minLength: n => `Usa al menos ${n} caracteres.`,
  maxLength: n => `Usa menos de ${n} caracteres.`,
  minNumber: n => `Introduce un número igual o mayor que ${n}.`,
  maxNumber: n => `Introduce un número igual o menor que ${n}.`,
  integer: 'Solo números enteros.',
  minSelections: n => `Elige al menos ${n}.`,
  maxSelections: n => `Elige como máximo ${n}.`,
  invalidDate: 'Introduce una fecha válida.',
  minDate: d => `Elige una fecha a partir del ${d}.`,
  maxDate: d => `Elige una fecha hasta el ${d}.`,
  futureOnly: 'Elige una fecha futura.',
  pastOnly: 'Elige una fecha pasada.',
  rangeOrder: 'La fecha de fin tiene que ser posterior a la de inicio.',
  fileType: a => `Aquí no se acepta ese tipo de archivo. Prueba con ${a}.`,
  fileSize: mb => `Los archivos deben pesar menos de ${mb} MB.`,
  tooManyFiles: n => `Puedes añadir hasta ${n} archivo${n === 1 ? '' : 's'}.`,
  workEmail: 'Usa un correo del trabajo (no gmail, outlook, yahoo…).',
  invalidOption: 'Elige una de las opciones de la lista.',
  invalidTime: 'Introduce una hora válida.',
  addressIncomplete: 'Introduce al menos la calle y la ciudad.',
  signatureTooShort: 'Dibuja tu firma completa.',
  signatureTypeName: 'Escribe tu nombre completo para firmar.',
  duplicateEmail: 'Esta dirección de correo ya se usó para responder.',
  requiredGeneric: 'Esta respuesta es obligatoria.',
  requiredQuestion: 'Esta pregunta necesita una respuesta.',
  requiredByType: {
    email: 'Introduce tu correo electrónico.', phone: 'Introduce un número de teléfono.', dropdown: 'Elige una opción.', choice: 'Elige una opción.', picture: 'Elige una opción.',
    checks: 'Elige al menos una.', yesno: 'Elige sí o no.', switch: 'Actívalo para continuar.', rating: 'Elige una valoración.', scale: 'Elige un número.', long: 'Esta pregunta necesita una respuesta.',
    short: 'Esta pregunta necesita una respuesta.', number: 'Introduce un número.', date: 'Introduce una fecha.', datetime: 'Introduce una fecha y una hora.', time: 'Introduce una hora.', daterange: 'Introduce las dos fechas.',
    upload: 'Añade un archivo para continuar.', url: 'Introduce una dirección web.', ranking: 'Ordena las opciones para continuar.', matrix: 'Responde a todas las filas.', address: 'Introduce tu dirección.', signature: 'Añade tu firma para continuar.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX o PNG', docs: 'PDF o DOCX', images: 'PNG o JPG', any: 'otro archivo' },
}

const fr: ErrorCatalog = {
  invalidEmail: 'Cela ne ressemble pas à une adresse e-mail. Vérifiez qu’il n’y a pas de faute de frappe.',
  invalidPhone: 'Saisissez un numéro de téléphone d’au moins 7 chiffres.',
  phoneMissing: 'Saisissez un numéro de téléphone.',
  invalidNumber: 'Uniquement des chiffres, s’il vous plaît.',
  invalidUrl: 'Saisissez une adresse complète commençant par https://',
  uploadRequired: 'Ajoutez un fichier pour continuer.',
  uploadFailed: 'Ce fichier n’a pas été envoyé. Réessayez ou retirez-le.',
  uploadBusy: 'Attendez la fin de l’envoi.',
  minLength: n => `Utilisez au moins ${n} caractères.`,
  maxLength: n => `Restez sous ${n} caractères.`,
  minNumber: n => `Saisissez un nombre supérieur ou égal à ${n}.`,
  maxNumber: n => `Saisissez un nombre inférieur ou égal à ${n}.`,
  integer: 'Nombres entiers uniquement.',
  minSelections: n => `Choisissez-en au moins ${n}.`,
  maxSelections: n => `Choisissez-en ${n} au maximum.`,
  invalidDate: 'Saisissez une date valide.',
  minDate: d => `Choisissez une date à partir du ${d}.`,
  maxDate: d => `Choisissez une date jusqu’au ${d}.`,
  futureOnly: 'Choisissez une date dans le futur.',
  pastOnly: 'Choisissez une date dans le passé.',
  rangeOrder: 'La date de fin doit être postérieure à la date de début.',
  fileType: a => `Ce type de fichier n’est pas accepté ici. Essayez ${a}.`,
  fileSize: mb => `Les fichiers doivent faire moins de ${mb} Mo.`,
  tooManyFiles: n => `Vous pouvez ajouter jusqu’à ${n} fichier${n === 1 ? '' : 's'}.`,
  workEmail: 'Utilisez une adresse e-mail professionnelle (pas gmail, outlook, yahoo…).',
  invalidOption: 'Choisissez l’une des options proposées.',
  invalidTime: 'Saisissez une heure valide.',
  addressIncomplete: 'Saisissez au moins une adresse et une ville.',
  signatureTooShort: 'Dessinez votre signature complète.',
  signatureTypeName: 'Saisissez votre nom complet pour signer.',
  duplicateEmail: 'Cette adresse e-mail a déjà été utilisée pour répondre.',
  requiredGeneric: 'Cette réponse est obligatoire.',
  requiredQuestion: 'Cette question attend une réponse.',
  requiredByType: {
    email: 'Saisissez votre adresse e-mail.', phone: 'Saisissez un numéro de téléphone.', dropdown: 'Choisissez une option.', choice: 'Choisissez une option.', picture: 'Choisissez une option.',
    checks: 'Choisissez-en au moins une.', yesno: 'Choisissez oui ou non.', switch: 'Activez-le pour continuer.', rating: 'Choisissez une note.', scale: 'Choisissez un nombre.', long: 'Cette question attend une réponse.',
    short: 'Cette question attend une réponse.', number: 'Saisissez un nombre.', date: 'Saisissez une date.', datetime: 'Saisissez une date et une heure.', time: 'Saisissez une heure.', daterange: 'Saisissez les deux dates.',
    upload: 'Ajoutez un fichier pour continuer.', url: 'Saisissez une adresse web.', ranking: 'Classez les options pour continuer.', matrix: 'Répondez à chaque ligne.', address: 'Saisissez votre adresse.', signature: 'Ajoutez votre signature pour continuer.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX ou PNG', docs: 'PDF ou DOCX', images: 'PNG ou JPG', any: 'un autre fichier' },
}

const de: ErrorCatalog = {
  invalidEmail: 'Das sieht nicht nach einer E-Mail-Adresse aus. Bitte auf Tippfehler prüfen.',
  invalidPhone: 'Geben Sie eine Telefonnummer mit mindestens 7 Ziffern ein.',
  phoneMissing: 'Geben Sie eine Telefonnummer ein.',
  invalidNumber: 'Bitte nur Zahlen.',
  invalidUrl: 'Geben Sie eine vollständige Adresse ein, die mit https:// beginnt.',
  uploadRequired: 'Fügen Sie eine Datei hinzu, um fortzufahren.',
  uploadFailed: 'Diese Datei wurde nicht hochgeladen. Erneut versuchen oder entfernen.',
  uploadBusy: 'Warten Sie, bis der Upload abgeschlossen ist.',
  minLength: n => `Verwenden Sie mindestens ${n} Zeichen.`,
  maxLength: n => `Bleiben Sie unter ${n} Zeichen.`,
  minNumber: n => `Geben Sie eine Zahl von mindestens ${n} ein.`,
  maxNumber: n => `Geben Sie eine Zahl von höchstens ${n} ein.`,
  integer: 'Nur ganze Zahlen.',
  minSelections: n => `Wählen Sie mindestens ${n}.`,
  maxSelections: n => `Wählen Sie höchstens ${n}.`,
  invalidDate: 'Geben Sie ein gültiges Datum ein.',
  minDate: d => `Wählen Sie ein Datum am oder nach dem ${d}.`,
  maxDate: d => `Wählen Sie ein Datum am oder vor dem ${d}.`,
  futureOnly: 'Wählen Sie ein Datum in der Zukunft.',
  pastOnly: 'Wählen Sie ein Datum in der Vergangenheit.',
  rangeOrder: 'Das Enddatum muss nach dem Startdatum liegen.',
  fileType: a => `Dieser Dateityp wird hier nicht akzeptiert. Versuchen Sie ${a}.`,
  fileSize: mb => `Dateien müssen kleiner als ${mb} MB sein.`,
  tooManyFiles: n => `Sie können bis zu ${n} Datei${n === 1 ? '' : 'en'} hinzufügen.`,
  workEmail: 'Verwenden Sie eine geschäftliche E-Mail-Adresse (nicht gmail, outlook, yahoo…).',
  invalidOption: 'Wählen Sie eine der aufgeführten Optionen.',
  invalidTime: 'Geben Sie eine gültige Uhrzeit ein.',
  addressIncomplete: 'Geben Sie mindestens Straße und Ort ein.',
  signatureTooShort: 'Zeichnen Sie Ihre vollständige Unterschrift.',
  signatureTypeName: 'Geben Sie zum Unterschreiben Ihren vollständigen Namen ein.',
  duplicateEmail: 'Mit dieser E-Mail-Adresse wurde bereits geantwortet.',
  requiredGeneric: 'Diese Antwort ist erforderlich.',
  requiredQuestion: 'Diese Frage braucht eine Antwort.',
  requiredByType: {
    email: 'Geben Sie Ihre E-Mail-Adresse ein.', phone: 'Geben Sie eine Telefonnummer ein.', dropdown: 'Wählen Sie eine Option.', choice: 'Wählen Sie eine Option.', picture: 'Wählen Sie eine Option.',
    checks: 'Wählen Sie mindestens eine.', yesno: 'Wählen Sie Ja oder Nein.', switch: 'Schalten Sie dies ein, um fortzufahren.', rating: 'Wählen Sie eine Bewertung.', scale: 'Wählen Sie eine Zahl.', long: 'Diese Frage braucht eine Antwort.',
    short: 'Diese Frage braucht eine Antwort.', number: 'Geben Sie eine Zahl ein.', date: 'Geben Sie ein Datum ein.', datetime: 'Geben Sie Datum und Uhrzeit ein.', time: 'Geben Sie eine Uhrzeit ein.', daterange: 'Geben Sie beide Daten ein.',
    upload: 'Fügen Sie eine Datei hinzu, um fortzufahren.', url: 'Geben Sie eine Webadresse ein.', ranking: 'Ordnen Sie die Optionen, um fortzufahren.', matrix: 'Beantworten Sie jede Zeile.', address: 'Geben Sie Ihre Adresse ein.', signature: 'Fügen Sie Ihre Unterschrift hinzu, um fortzufahren.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX oder PNG', docs: 'PDF oder DOCX', images: 'PNG oder JPG', any: 'eine andere Datei' },
}

const pt: ErrorCatalog = {
  invalidEmail: 'Isso não parece um endereço de e-mail. Verifique se há um erro de digitação.',
  invalidPhone: 'Digite um número de telefone com pelo menos 7 dígitos.',
  phoneMissing: 'Digite um número de telefone.',
  invalidNumber: 'Apenas números, por favor.',
  invalidUrl: 'Digite um endereço completo que comece com https://',
  uploadRequired: 'Adicione um arquivo para continuar.',
  uploadFailed: 'Este arquivo não foi enviado. Tente de novo ou remova-o.',
  uploadBusy: 'Aguarde o envio terminar.',
  minLength: n => `Use pelo menos ${n} caracteres.`,
  maxLength: n => `Use menos de ${n} caracteres.`,
  minNumber: n => `Digite um número de no mínimo ${n}.`,
  maxNumber: n => `Digite um número de no máximo ${n}.`,
  integer: 'Apenas números inteiros.',
  minSelections: n => `Escolha pelo menos ${n}.`,
  maxSelections: n => `Escolha no máximo ${n}.`,
  invalidDate: 'Digite uma data válida.',
  minDate: d => `Escolha uma data a partir de ${d}.`,
  maxDate: d => `Escolha uma data até ${d}.`,
  futureOnly: 'Escolha uma data no futuro.',
  pastOnly: 'Escolha uma data no passado.',
  rangeOrder: 'A data final tem de ser posterior à data inicial.',
  fileType: a => `Esse tipo de arquivo não é aceito aqui. Tente ${a}.`,
  fileSize: mb => `Os arquivos precisam ter menos de ${mb} MB.`,
  tooManyFiles: n => `Você pode adicionar até ${n} arquivo${n === 1 ? '' : 's'}.`,
  workEmail: 'Use um e-mail de trabalho (não gmail, outlook, yahoo…).',
  invalidOption: 'Escolha uma das opções listadas.',
  invalidTime: 'Digite um horário válido.',
  addressIncomplete: 'Digite pelo menos a rua e a cidade.',
  signatureTooShort: 'Desenhe a sua assinatura completa.',
  signatureTypeName: 'Digite o seu nome completo para assinar.',
  duplicateEmail: 'Este endereço de e-mail já foi usado para responder.',
  requiredGeneric: 'Esta resposta é obrigatória.',
  requiredQuestion: 'Esta pergunta precisa de uma resposta.',
  requiredByType: {
    email: 'Digite o seu e-mail.', phone: 'Digite um número de telefone.', dropdown: 'Escolha uma opção.', choice: 'Escolha uma opção.', picture: 'Escolha uma opção.',
    checks: 'Escolha pelo menos uma.', yesno: 'Escolha sim ou não.', switch: 'Ative para continuar.', rating: 'Escolha uma avaliação.', scale: 'Escolha um número.', long: 'Esta pergunta precisa de uma resposta.',
    short: 'Esta pergunta precisa de uma resposta.', number: 'Digite um número.', date: 'Digite uma data.', datetime: 'Digite uma data e um horário.', time: 'Digite um horário.', daterange: 'Digite as duas datas.',
    upload: 'Adicione um arquivo para continuar.', url: 'Digite um endereço web.', ranking: 'Ordene as opções para continuar.', matrix: 'Responda a todas as linhas.', address: 'Digite o seu endereço.', signature: 'Adicione a sua assinatura para continuar.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX ou PNG', docs: 'PDF ou DOCX', images: 'PNG ou JPG', any: 'outro arquivo' },
}

const it: ErrorCatalog = {
  invalidEmail: 'Non sembra un indirizzo email. Controlla che non ci siano errori di battitura.',
  invalidPhone: 'Inserisci un numero di telefono di almeno 7 cifre.',
  phoneMissing: 'Inserisci un numero di telefono.',
  invalidNumber: 'Solo numeri, per favore.',
  invalidUrl: 'Inserisci un indirizzo completo che inizi con https://',
  uploadRequired: 'Aggiungi un file per continuare.',
  uploadFailed: 'Questo file non è stato caricato. Riprova o rimuovilo.',
  uploadBusy: 'Attendi la fine del caricamento.',
  minLength: n => `Usa almeno ${n} caratteri.`,
  maxLength: n => `Resta sotto i ${n} caratteri.`,
  minNumber: n => `Inserisci un numero di almeno ${n}.`,
  maxNumber: n => `Inserisci un numero non superiore a ${n}.`,
  integer: 'Solo numeri interi.',
  minSelections: n => `Scegline almeno ${n}.`,
  maxSelections: n => `Scegline al massimo ${n}.`,
  invalidDate: 'Inserisci una data valida.',
  minDate: d => `Scegli una data dal ${d} in poi.`,
  maxDate: d => `Scegli una data fino al ${d}.`,
  futureOnly: 'Scegli una data nel futuro.',
  pastOnly: 'Scegli una data nel passato.',
  rangeOrder: 'La data di fine deve essere successiva alla data di inizio.',
  fileType: a => `Questo tipo di file non è accettato qui. Prova ${a}.`,
  fileSize: mb => `I file devono pesare meno di ${mb} MB.`,
  tooManyFiles: n => `Puoi aggiungere fino a ${n} file.`,
  workEmail: 'Usa un indirizzo email di lavoro (non gmail, outlook, yahoo…).',
  invalidOption: 'Scegli una delle opzioni elencate.',
  invalidTime: 'Inserisci un orario valido.',
  addressIncomplete: 'Inserisci almeno via e città.',
  signatureTooShort: 'Disegna la tua firma completa.',
  signatureTypeName: 'Scrivi il tuo nome completo per firmare.',
  duplicateEmail: 'Questo indirizzo email è già stato usato per rispondere.',
  requiredGeneric: 'Questa risposta è obbligatoria.',
  requiredQuestion: 'Questa domanda richiede una risposta.',
  requiredByType: {
    email: 'Inserisci il tuo indirizzo email.', phone: 'Inserisci un numero di telefono.', dropdown: 'Scegli un’opzione.', choice: 'Scegli un’opzione.', picture: 'Scegli un’opzione.',
    checks: 'Scegline almeno una.', yesno: 'Scegli sì o no.', switch: 'Attivalo per continuare.', rating: 'Scegli una valutazione.', scale: 'Scegli un numero.', long: 'Questa domanda richiede una risposta.',
    short: 'Questa domanda richiede una risposta.', number: 'Inserisci un numero.', date: 'Inserisci una data.', datetime: 'Inserisci data e ora.', time: 'Inserisci un orario.', daterange: 'Inserisci entrambe le date.',
    upload: 'Aggiungi un file per continuare.', url: 'Inserisci un indirizzo web.', ranking: 'Ordina le opzioni per continuare.', matrix: 'Rispondi a ogni riga.', address: 'Inserisci il tuo indirizzo.', signature: 'Aggiungi la tua firma per continuare.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX o PNG', docs: 'PDF o DOCX', images: 'PNG o JPG', any: 'un altro file' },
}

const nl: ErrorCatalog = {
  invalidEmail: 'Dat lijkt geen e-mailadres. Controleer op een typefout.',
  invalidPhone: 'Vul een telefoonnummer in van minstens 7 cijfers.',
  phoneMissing: 'Vul een telefoonnummer in.',
  invalidNumber: 'Alleen cijfers, alsjeblieft.',
  invalidUrl: 'Vul een volledig adres in dat begint met https://',
  uploadRequired: 'Voeg een bestand toe om verder te gaan.',
  uploadFailed: 'Dit bestand is niet geüpload. Probeer het opnieuw of verwijder het.',
  uploadBusy: 'Wacht tot het uploaden klaar is.',
  minLength: n => `Gebruik minstens ${n} tekens.`,
  maxLength: n => `Blijf onder de ${n} tekens.`,
  minNumber: n => `Vul een getal in van minstens ${n}.`,
  maxNumber: n => `Vul een getal in van hoogstens ${n}.`,
  integer: 'Alleen hele getallen.',
  minSelections: n => `Kies er minstens ${n}.`,
  maxSelections: n => `Kies er hoogstens ${n}.`,
  invalidDate: 'Vul een geldige datum in.',
  minDate: d => `Kies een datum op of na ${d}.`,
  maxDate: d => `Kies een datum op of vóór ${d}.`,
  futureOnly: 'Kies een datum in de toekomst.',
  pastOnly: 'Kies een datum in het verleden.',
  rangeOrder: 'De einddatum moet na de begindatum liggen.',
  fileType: a => `Dit bestandstype wordt hier niet geaccepteerd. Probeer ${a}.`,
  fileSize: mb => `Bestanden moeten kleiner zijn dan ${mb} MB.`,
  tooManyFiles: n => `Je kunt tot ${n} bestand${n === 1 ? '' : 'en'} toevoegen.`,
  workEmail: 'Gebruik een zakelijk e-mailadres (geen gmail, outlook, yahoo…).',
  invalidOption: 'Kies een van de genoemde opties.',
  invalidTime: 'Vul een geldige tijd in.',
  addressIncomplete: 'Vul minstens een straat en een plaats in.',
  signatureTooShort: 'Teken je volledige handtekening.',
  signatureTypeName: 'Typ je volledige naam om te ondertekenen.',
  duplicateEmail: 'Met dit e-mailadres is al gereageerd.',
  requiredGeneric: 'Dit antwoord is verplicht.',
  requiredQuestion: 'Deze vraag heeft een antwoord nodig.',
  requiredByType: {
    email: 'Vul je e-mailadres in.', phone: 'Vul een telefoonnummer in.', dropdown: 'Kies een optie.', choice: 'Kies een optie.', picture: 'Kies een optie.',
    checks: 'Kies er minstens één.', yesno: 'Kies ja of nee.', switch: 'Zet dit aan om verder te gaan.', rating: 'Kies een beoordeling.', scale: 'Kies een getal.', long: 'Deze vraag heeft een antwoord nodig.',
    short: 'Deze vraag heeft een antwoord nodig.', number: 'Vul een getal in.', date: 'Vul een datum in.', datetime: 'Vul een datum en tijd in.', time: 'Vul een tijd in.', daterange: 'Vul beide datums in.',
    upload: 'Voeg een bestand toe om verder te gaan.', url: 'Vul een webadres in.', ranking: 'Rangschik de opties om verder te gaan.', matrix: 'Beantwoord elke rij.', address: 'Vul je adres in.', signature: 'Voeg je handtekening toe om verder te gaan.',
  },
  acceptLabel: { 'docs-images': 'PDF, DOCX of PNG', docs: 'PDF of DOCX', images: 'PNG of JPG', any: 'een ander bestand' },
}

export const ERROR_CATALOGS: Record<FormLanguage, ErrorCatalog> = { en, es, fr, de, pt, it, nl }

let active: FormLanguage = 'en'

/** The language validation messages are written in right now. */
export function activeLanguage(): FormLanguage { return active }

/** Run `fn` with the built-in copy in `lang` (English when unknown). */
export function withLanguage<T>(lang: unknown, fn: () => T): T {
  const prev = active
  active = isFormLanguage(lang) ? lang : 'en'
  try { return fn() } finally { active = prev }
}

/** The validation catalog for `lang`, or the active one. */
export function errorsFor(lang?: unknown): ErrorCatalog {
  return ERROR_CATALOGS[isFormLanguage(lang) ? lang : active]
}
