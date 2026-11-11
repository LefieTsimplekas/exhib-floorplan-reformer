# Κατόψεις Stand · exhib-floorplan-reformer

Εφαρμογή που ανοίγει στον browser: ανεβάζετε το DWG μιας έκθεσης (AutoCAD ή ActCAD) και παίρνετε για κάθε περίπτερο καθαρή κάτοψη A3:

- `ΕΚΘΕΣΗ_Periptero_NN_XARTHS.pdf`: όλες οι γραμμές μαύρες, διανυσματικό PDF
- `ΕΚΘΕΣΗ_Periptero_NN_GALAXY.jpg`: stand με μπλε περίγραμμα, JPG 300 dpi

**Χρήση:** https://lefietsimplekas.github.io/exhib-floorplan-reformer/

## Τι κάνει
- Βρίσκει μόνη της τα layers των stand, των κωδικών και των τοίχων, και τα περίπτερα από τις ετικέτες «ΠΕΡΙΠΤΕΡΟ».
- Κρατά μόνο τοίχους, πόρτες, σκάλες, τα stand και τους κωδικούς τους. Καμία άλλη γραμμή πάνω στα stand.
- Κωδικοί πάντα με λατινικούς χαρακτήρες και δύο ψηφία (E1 → E01, 1A → 01A).
- Ο κωδικός μπαίνει μέσα στο stand. Αν δεν χωράει, μπαίνει δίπλα, κεντραρισμένος στο stand.
- Αν το κτίριο είναι σε ξεχωριστό αρχείο (xref), σας το ζητά.
- Διορθώσεις από τη σελίδα: όρια περιπτέρων, αλλαγή κωδικού, χωρισμός stand χωρίς διαχωριστική γραμμή, αριθμός ή κείμενο σε κενά κουτιά.

## Ιδιωτικότητα
Το DWG επεξεργάζεται μόνο στον browser του χρήστη. Δεν ανεβαίνει πουθενά.

## Άδειες
Η εφαρμογή διανέμεται με άδεια GPL-3.0 (δείτε `LICENSE`), γιατί περιλαμβάνει τον αναγνώστη DWG
[LibreDWG](https://www.gnu.org/software/libredwg/) μέσω του [@mlightcad/libredwg-web](https://github.com/mlightcad/libredwg-web) (GPL-3.0).
Χρησιμοποιεί επίσης τις [JSTS](https://github.com/bjornharrtell/jsts) (EPL/EDL), [jsPDF](https://github.com/parallax/jsPDF) (MIT),
[JSZip](https://github.com/Stuk/jszip) (MIT) και τη γραμματοσειρά Liberation Sans (SIL OFL 1.1, υποσύνολο ενσωματωμένο).
Ο πηγαίος κώδικας της εφαρμογής βρίσκεται στον φάκελο `src/`.
