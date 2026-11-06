from protocol_schema import DeathRecord, Fish, Journal, Pedigree

MAX_PEDIGREE = Journal.MAX_PEDIGREE
COPIED = ("ID", "SPECIES", "PARENT", "FATHER", "DEPTH", "GENERATION", "BORN", "ORIGIN", "CLONAL")


def update_pedigree(journal, f, fish, step):
    living = {p[Fish.ID] for p in fish if p[Fish.HATCHED]}
    for p in fish:
        if not p[Fish.HATCHED]:
            continue
        old = journal.pedigree.get(p[Fish.ID])
        row = [0] * Pedigree.SEEN + [step]
        for name in COPIED:
            column = getattr(Fish, name)
            row[getattr(Pedigree, name)] = p[column] if len(p) > column else 0
        row[Pedigree.FIRST] = old[Pedigree.FIRST] if old else step
        journal.pedigree[p[Fish.ID]] = row
    mortality_changed = False
    for death in f.get("recent_deaths", []):
        row = journal.pedigree.get(death[DeathRecord.ID])
        recorded = [death[DeathRecord.CAUSE], death[DeathRecord.STEP]]
        if row and row[Pedigree.DEATH_CAUSE :] != recorded:
            row[Pedigree.DEATH_CAUSE :] = recorded
            mortality_changed = True
    if len(journal.pedigree) > MAX_PEDIGREE:
        parents = {
            parent
            for identifier in living
            for parent in journal.pedigree[identifier][Pedigree.PARENT : Pedigree.FATHER + 1]
            if parent in journal.pedigree
        }
        order = sorted(
            journal.pedigree,
            key=lambda identifier: (
                identifier not in living,
                identifier not in parents,
                -identifier,
            ),
        )
        journal.pedigree = {
            identifier: journal.pedigree[identifier] for identifier in order[:MAX_PEDIGREE]
        }
    return mortality_changed
