"""Turns research notes into text for readers of the site.

The notes were written while researching, so they mention field names, failed page loads and the first person.
Notes that only describe the data files are dropped; the rest are reworded.
"""

import re

# Whole notes that only explain how the data files were made, or that were written for one person.
DROP_NOTE = re.compile(
    r"^(gross_yearly|Gross yearly shown|everyday_parts|health is 0|Surplus is net)"
    r"|University of Zagreb|Croatians have had|everyday_parts are"
)

# (pattern, replacement) applied in order to every text field.
REWORDING = [
    (r"\s*\(from search summaries, not an opened (official )?page\)", ""),
    (r"\s*gross_yearly is [^.]*\.", ""),
    (r"room_shared is", "The shared-room rent is"),
    (r"rent_centre", "centre rent"),
    (r"rent_outside", "outside-centre rent"),
    (r"Price from a search result, the Skanetrafiken page returned 404; the", "Price from a search result; the"),
    (r"Price from a search result quoting HSL; hsl\.fi returned 403\.", "Price from a search result quoting HSL."),
    (r"Price from a press report in a search result; the SNCB page confirming it returned 403\.", "Price from a press report."),
    (r"Numbeo returned HTTP 429 for Tallinn and Tartu, so rent and everyday costs come from asking-rent guides and my own guess",
     "Numbeo has no usable pages for Tallinn and Tartu, so rent and everyday costs come from asking-rent guides and a guess"),
    (r"Numbeo's Ghent page returned HTTP 429", "Numbeo has no usable Ghent page"),
    (r"there is no Croatian or student-specific minimum wage", "there is no student-specific minimum wage"),
    (r"Croatians are EU citizens and need no work permit", "EU citizens need no work permit"),
    (r"whether your Croatian freelance years count against the 10 years is not confirmed",
     "whether earlier self-employed years count against the 10 years is not confirmed"),
    (r"so Croatia fits", "so most EU countries qualify"),
    (r"\bCroatian (citizen|employee)(s?)\b", r"EU \1\2"),
    (r"\(my weights\)", "(chosen weights)"),
    (r"\(my (assumption)\)", r"(an \1)"),
    (r"\(my understanding, not checked per firm\)", "(not checked per firm)"),
    (r"\(my calculation matches", "(the calculation matches"),
    (r"is my calculation, within", "is calculated here, within"),
    (r"\(my calculation\)", "(calculated here)"),
    (r"\(my arithmetic\)", "(simple arithmetic)"),
    (r"\(my ESTIMATE\)", "(an ESTIMATE)"),
    (r"\(my rough estimate:", "(a rough estimate:"),
    (r"my rough estimate is", "a rough estimate is"),
    (r"my own adjustment", "an adjustment"),
    (r"my own guess", "a guess"),
    (r"(coverage|this) is my assumption", r"\1 is an assumption"),
    (r"I assumed 70% take-home", "70% take-home was assumed"),
    (r"in the pages I read", "in the pages read"),
    (r"I treated them a(s?)", r"they were treated a\1"),
    (r"I matched levels", "levels were matched"),
    (r"I did not measure (the )?share of English-only jobs", "the share of English-only jobs was not measured"),
    (r"I did not measure English-only job share in (\w+)", r"English-only job share in \1 was not measured"),
    (r"one (\w+-area) ad I opened", r"one \1 ad"),
    (r"but I found no ([^,;.]+?)( I could open)?,", r"but no \1 was found,"),
    (r"(^|\. )I found no ([^,;.]+)", lambda m: f"{m.group(1)}No {m.group(2)} was found"),
    (r"I found no ([^,;.]+)", r"no \1 was found"),
    (r"everyday_parts are my estimates", "Everyday costs are estimates"),
    (r"No payroll health premium, so health is 0\.", "There is no separate payroll health premium."),
    (r"; I estimate about", "; an estimate is about"),
    (r"not confirmed on a page I opened", "not confirmed on an official page"),
    (r", which is not confirmed for a FER degree\.", "; check that the degree is recognised."),
    (r"Net and surplus fields exclude the allowance\.", "Net pay and money left shown on this site exclude the allowance."),
    (r"a Croatian new grad", "a new graduate from another EU country"),
    (r"Indeed Greece pages were blocked \(HTTP 401\), so no posted-pay ads could be opened; a search summary showed", "No posted-pay ads could be checked directly; search results showed"),
    (r"A search summary of DEV\.BG job pages showed", "Search results for DEV.BG job pages showed"),
    (r"gross_yearly", "the gross figure"),
    (r"'health'", "the health insurance row"),
]

COMPILED = [(re.compile(pattern), replacement) for pattern, replacement in REWORDING]


def public_text(value):
    if isinstance(value, str):
        for pattern, replacement in COMPILED:
            value = pattern.sub(replacement, value)
        return value

    if isinstance(value, list):
        kept = [note for note in value if not (isinstance(note, str) and DROP_NOTE.search(note))]
        return [public_text(item) for item in kept]

    return value
