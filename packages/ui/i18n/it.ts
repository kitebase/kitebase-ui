import { registerTranslations } from './index';

registerTranslations('it', {
  // validation
  'is required':              'è obbligatorio',
  'Invalid numeric value':    'Valore numerico non valido',
  'Implausible year':         'Anno non plausibile',
  'Not valid JSON':           'JSON non valido',

  // checklist
  'from':                     'da',
  'Unknown':                  'Sconosciuti',
  'The choices could not be loaded': 'Non è stato possibile caricare le scelte',
  'Invalid time: 930, 9.30, 9:30': 'Ora non valida: 930, 9.30, 9:30',
  'time':                     'ora',

  // form states
  'Loading…':                 'Caricamento…',
  'Saving…':                  'Salvataggio…',
  'Saved':                    'Salvato',
  'Unsaved changes':          'Modifiche non salvate',
  'No fields configured.':    'Nessun campo configurato.',
  'Select an item to view the detail.': 'Seleziona un elemento per visualizzare il dettaglio.',

  // media
  'No file':                  'Nessun file',
  'Image unavailable':        'Immagine non disponibile',
  'Save the record before adding a file': 'Salva il record prima di aggiungere un file',
  'Uploading…':               'Caricamento…',
  'Replace':                  'Sostituisci',
  'Choose an image':          "Scegli un'immagine",
  'Choose a file':            'Scegli un file',
  'or drop it here':          'o trascinalo qui',
  'Upload failed':            'Caricamento non riuscito',
  '{name} is {size}: this field takes up to {max}': '{name} pesa {size}: questo campo accetta fino a {max}',
  'Image larger than required': 'Immagine più grande del richiesto',
  '{name} is {width}x{height} pixels, {size}. This field reduces images to {side} pixels on the longest side.':
    '{name} misura {width}x{height} pixel, {size}. Questo campo riduce le immagini a {side} pixel sul lato lungo.',
  'The original is over the limit of {max}.': "L'originale supera il limite di {max}.",
  'Keep the original':        "Tieni l'originale",
  'Add files':                'Aggiungi file',
  'or drop them here':        'o trascinali qui',
  'Description':              'Descrizione',
  '{name} moved to the trash': '{name} spostato nel cestino',
  'Error loading':            'Errore nel caricamento',
  // view switcher, cards
  'Yes':                       'Sì',
  'No':                        'No',
  'Table':                     'Tabella',
  'Tree':                      'Albero',
  'Cards':                     'Schede',
  'Reduce':                   'Riduci',

  // form errors
  'Error loading data':       'Errore nel caricamento',
  'Error saving':             'Errore nel salvataggio',

  // form confirm
  'The changes to this record will be lost.': 'Le modifiche a questo record andranno perse.',
  'Delete':                   'Elimina',
  'Discard changes':          'Scarta le modifiche',
  'Keep editing':             'Continua a modificare',

  // form buttons
  'Save':                     'Salva',
  'Save (F12 or Ctrl+Enter)': 'Salva (F12 o Ctrl+Enter)',
  // An intermediate frame confirms into the buffer; only the root saves.
  'Confirm (F12 or Ctrl+Enter)': 'Conferma (F12 o Ctrl+Enter)',
  'Next (F12 or Ctrl+Enter)': 'Avanti (F12 o Ctrl+Enter)',
  'Next':                     'Avanti',
  'Back to {step}':           'Torna a {step}',
  'Cancel':                   'Annulla',
  'Cancel (Esc)':             'Annulla (Esc)',
  'Commands':                 'Comandi',

  // dataview navigator
  'Add (Ins)':                'Aggiungi (Ins)',
  'Edit (Enter)':             'Modifica (Enter)',
  'Delete (Del)':             'Elimina (Del)',
  'Accept (Enter)':           'Accetta (Enter)',
  'Multiple selection':       'Selezione multipla',
  'Column filter':            'Filtro colonne',
  'Advanced search':          'Ricerca avanzata',
  'Group by':                 'Raggruppa',
  'Export (F7)':              'Esporta (F7)',
  'Export':                   'Esporta',
  'The {n} loaded':           'Le {n} caricate',
  'All {n}':                  'Tutte ({n})',
  'The list shows {n} of {total} rows.': 'La lista mostra {n} righe su {total}.',
  'No rows to export':        'Nessuna riga da esportare',
  '{n} rows are more than the {limit} an export can hold: narrow the selection':
    "{n} righe sono più delle {limit} che un'esportazione può contenere: restringi la selezione",
  'Print (F5)':               'Stampa (F5)',
  'Refresh (F6)':             'Aggiorna (F6)',
  'Load more':                'Carica altri',
  'Load {n} rows':            'Carica {n} righe',
  'Load all':                 'Carica tutto',
  'Reset view':               'Ripristina la vista',
  'View':                     'Vista',

  // dataview actions
  'Edit':                     'Modifica',
  'New':                      'Nuovo',
  'Delete the selected record?': 'Eliminare il record selezionato?',
  'Error deleting record':    'Errore durante l\'eliminazione',

  // dataformview
  'Back to list':             'Torna alla lista',
  'Back':                     'Torna',

  // guide
  'Guide':                    'Guida',
  'Guide (F1)':               'Guida (F1)',
  'Open the guide':           'Apri la guida',
  'Manual':                   'Manuale',
  'The manual could not be opened': 'Non è stato possibile aprire il manuale',
  'The guide could not be opened': 'Non è stato possibile aprire la guida',
  'Print':                    'Stampa',

  // widgets
  'Search…':                  'Cerca…',
  'Searching…':               'Ricerca…',
  'No results':               'Nessun risultato',
  'Search more…':             'Cerca altro…',
  'Select…':                  'Seleziona…',
  'Select':                   'Seleziona',
  'Clear selection':          'Cancella selezione',
  'Clear search':             'Svuota la ricerca',
  'Search (Enter)':           'Cerca (Invio)',

  // rule editor
  'Filter editor':            'Editor dei filtri',
  'Filter — {model}':         'Filtro — {model}',
  'Apply':                    'Applica',
  'Quick search':             'Ricerca rapida',
  'Order by':                 'Ordina per',
  'Default ({order})':        'Predefinito ({order})',
  'as the view opens':        'come si apre la vista',
  'Ascending':                'Crescente',
  'Descending':               'Decrescente',
  'Back to the view order':   'Torna all\'ordine della vista',
  '· can be sorted cheaply':  '· ordinabile senza costo',
  'Add condition':            'Aggiungi condizione',
  'Add alternative':          'Aggiungi alternativa',
  'Clear all':                'Svuota',
  'Show more…':               'Mostra altri…',
  'More fields':              'Altri campi',
  'Conditions, search and order back to the view (Apply to confirm)':
    'Condizioni, ricerca e ordinamento tornano quelli della vista (Applica per confermare)',
  'Duplicates this block as an alternative': 'Duplica questo blocco come alternativa',
  'Remove condition':         'Togli la condizione',
  'Field':                    'Campo',
  'Operator':                 'Operatore',
  'Value':                    'Valore',
  'From':                     'Da',
  'To':                       'A',
  'Remove':                   'Togli',
  'Type a value, then Enter': 'Scrivi un valore, poi Invio',
  'time':                     'ora',
  'Optional: without a time the whole day counts': 'Facoltativa: senza ora vale il giorno intero',
  'all':                      'tutti',
  'yes':                      'sì',
  'no':                       'no',
  'Add a value':              'Aggiungi un valore',
  'AND':                      'E',
  'OR':                       'O',
  'AND — binds tighter':      'E — lega più stretto',
  'OR — starts an alternative': 'O — apre un\'alternativa',
  'Did you mean OR?':         'Forse volevi O?',
  'A field holds one value: no row can satisfy both.':
    'Un campo ha un valore solo: nessuna riga può soddisfare entrambe.',
  'That value falls outside the range asked for above.':
    'Quel valore cade fuori dall\'intervallo chiesto sopra.',
  'These bounds leave no value in between.':
    'Questi limiti non lasciano in mezzo nessun valore.',
  'An empty field satisfies no comparison.':
    'Un campo vuoto non soddisfa nessun confronto.',

  // operators
  'contains':                 'contiene',
  'starts with':              'inizia per',
  'is':                       'è',
  'is not':                   'non è',
  'greater than':             'maggiore di',
  'greater or equal':         'maggiore o uguale',
  'less than':                'minore di',
  'less or equal':            'minore o uguale',
  'between':                  'compreso fra',
  'is one of':                'è una di',
  'has any of':               'ha una fra',
  'is true':                  'è vero',
  'is false':                 'è falso',
  'is empty':                 'è vuoto',
  'is not empty':             'non è vuoto',

  // msgbox
  'Confirm':                  'Conferma',
  'Error':                    'Errore',
  'Close':                    'Chiudi',

  // chrome
  'Back to home':             'Torna alla home',

  // field help
  'Help':                     'Aiuto',
  'Help (F1)':                'Aiuto (F1)',
});
