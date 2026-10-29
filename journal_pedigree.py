"""Bounded pedigree and recorded mortality."""

from protocol_schema import Fish


def update_pedigree(journal, f, fish, step):
    living = {p[Fish.ID] for p in fish if p[Fish.HATCHED]}
    for p in fish:
        if not p[Fish.HATCHED]:
            continue
        first = journal.pedigree.get(p[Fish.ID], [0] * 9 + [step])[9]
        journal.pedigree[p[Fish.ID]] = [
            p[Fish.ID],
            p[Fish.SPECIES],
            p[Fish.PARENT] if len(p) > 35 else 0,
            p[Fish.FATHER],
            p[Fish.DEPTH],
            p[Fish.GENERATION],
            p[Fish.BORN] if len(p) > 40 else 0,
            p[Fish.ORIGIN],
            p[Fish.CLONAL],
            first,
            step,
        ]
    mortality_changed = False
    for identifier, cause, death_step in f.get("recent_deaths", []):
        row = journal.pedigree.get(identifier)
        if row and row[11:] != [cause, death_step]:
            row[11:] = [cause, death_step]
            mortality_changed = True
    if len(journal.pedigree) > 5000:
        parents = {
            parent
            for identifier in living
            for parent in journal.pedigree[identifier][2:4]
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
            identifier: journal.pedigree[identifier] for identifier in order[:5000]
        }
    return mortality_changed
