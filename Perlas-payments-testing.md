Regarding Testing
I cannot test PerlasFinance payments programmatically because:

PerlasFinance is a live bank payment system requiring real bank authentication
There's no sandbox/test API documented
The payment flow requires a browser-based bank redirect (the PerlasPay.init() JS widget)
Callbacks come from PerlasFinance's servers to your production callback URL
Recommended manual testing flow:

Deploy to a preview branch
Run the migration
Enable PerlasFinance for a test tutor in admin panel
As a student, initiate a 0.01 EUR payment
Complete it through bank
Watch Vercel Function logs (vercel logs --follow) for [perlas-callback] entries
Verify the session shows as paid
As the tutor, enter bank details and request a payout
Check the payout appears in PerlasFinance's system and the callback updates the status