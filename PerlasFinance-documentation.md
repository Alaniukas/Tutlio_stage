Introduction

Here you will find information on how to start using the PerlasPay payment system. If you have any questions, please contact us at info@perlasmip.lt.

Authorizations

To start integration with the PerlasPay system, you need to have a <projectId> and a <personal hash> (used for JWT encoding), which is provided by the PerlasPay team.

Banks list

Available countries and banks list json Banks json

Plug-ins

Please note that we do not provide customization services for plug-ins based on your e-shop setup. Since every e-shop is unique, there may be different compatibility issues between the plug-ins you already use and the PerlasPay plug-in. You are free to modify the PerlasPay plug-in code in any way necessary to match the specific requirements of your e-shop.

Platform	Version	Plug-in version	Download
Magento	2.4	1.0	Download
Banks CR API

To access the most up-to-date bank Conversion Rates (CR), please reach out to support and share a URL that can accept POST requests. Every 15 minutes, a JWT token containing percentage values of bank conversion rates will be delivered to the specified endpoint. Below is a sample token featuring a few countries (the actual token will include only the countries enabled for your project):

{
    "rates": {
        "LT": {
            "UANFLT21": 91,
            "CBVILT2X": 96,
            "INDULT2X": 95,
            "SANDLT22": 89,
        },
        "LV": {
            "UNLALV2X": 100,
            "SANDLV22": 100,
        }
    },
    "iat": 1640871923,
    "exp": 1640873723
}
Service types

Below you can find the abbreviations of the services that we offer:

PIS - Payment initiation service;
PCV - Payer account verification;
PAU - Payer code identification service;
OCP - OneClick payment;
PPS - Period (Recurring) payment service;
AIS - Account Information Service;
Payments Initiation

The payment initiation window is called using JavaScript. Ensure you place the script below within the <head> tags on your web page:

<script type="text/javascript" src="https://mip-pay.dataop.lt/pay.js"></script>
The payment initiation service is called using the PerlasPay.init method:

PerlasPay.init(
    url,
    token
);
Object Parameters
Parameter	Description
url	MIP payments environment address (https://mip-pay.dataop.lt/)
token	JWT token, generated and signed using the personal hash provided.
Token
To transmit payment parameters, you need to provide a signed access key (token), generated as a JWT (JSON Web Token) using the HS256 algorithm. Learn more at jwt.io.

JWT Token Parameters
Parameter	Mandatory	Description	Limitation
projectId	Yes	PerlasPay project ID	INT (>0)
amount	Yes	Payment amount	Decimal (two decimal places)
paymentPurpose	Yes	Purpose of the payment	100 characters max
transactionId	Yes	Unique transaction ID	Alphanumeric, 36 characters max
currency	Yes	Currency	EUR
returnUrl	Yes	URL for redirection after payment	500 characters max
bank	No	Preferred bank (BIC)	List of banks supported View
language	No	Preferred language	List of country supported View
payerConsent	No	The consent has been given on your side.	
Example Request
{
  "projectId": "1",
  "amount": "9.99",
  "paymentPurpose": "Order #1",
  "transactionId": "TRANS1",
  "currency": "EUR",
  "returnUrl": "https://return.url",
  "bank": "HABALT22",
  "payerConsent": "The payment initiation service is provided by UAB "Perlas Finance". By using this service, you confirm that you have read the rules."
}
Callbacks
Callbacks provide payment status updates to your system.

Client Side Callback
The returnUrl you provide informs your system of the payment status. Possible outcomes:

Cancel: The user cancels the payment, and the URL receives ?cancel=1:

https://yourwebsite.com/?cancel=1
Success: The payment is signed successfully, and the token is appended:

https://yourwebsite.com/?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0cmFuc2FjdGlvbklkIjoxMzQxNjYwNzUsImFtb3VudCI6IjAuMDEiLCJjdXJyZW5jeSI6IkVVUiIsInBheWVyQWNjb3VudE51bWJlciI6IkxUNDg3MzAwMDEwMDkyNjUwODc2Iiwic3RhdHVzIjoic2lnbmVkIn0.dG_WlcTAq9XXCJ6FPwXq_7DhDRIB2tbVUCUd8O-9ZDo
Example Token Data

{
  "transactionId": 134166075,
  "amount": "0.01",
  "currency": "EUR",
  "status": "signed"
}
Server Side Callback
A server-side callback URL is required for confirming successful payments. This URL must be shared with the PerlasPay team.

POST Request Example

{
  "data": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0cmFuc2FjdGlvbklkIjoiOTYxNDY1Y2IiLCJwYXllckNvZGVNYXRjaGVzIjp0cnVlLCJpYXQiOjE0OTMyMDg0OTgsImV4cCI6MTQ5MzI5NDg5OH0"
}
Using your provided personal hash, you can verify the authenticity of the request.

Responding to a Callback

When receiving the callback request, respond with:

{ 
    "status": "success" 
}
🔹 Response time requirement: Your server must respond within 15 seconds with HTTP 200 OK. If not received, the request will be retried every 5 minutes.

Decoded Token Example

{
  "type": "payment",
  "transactionId": "1111",
  "status": "success",
  "amount": "0.01",
  "service": "pis",
  "creditorName": "Vardas Pavardė",
  "creditorAccountNumber": "LT487300010092650876",
  "paymentPurpose": "Payment for services",
  "confirmedDate": "2025-04-26 12:08:18.03",
  "payerAccountNumber": "LT487300010092650876",
  "payerCode": "5366Nub/j7767UB3hf+8cw==" // It is returned only if it was provided during initiation.
}
Notes
The server-side callback is the only confirmation of a successful payment.
Ensure your system correctly handles retries for missing responses.
Use the provided personal hash to verify token integrity.
Second Server Side Callback
You can receive a second callback when the funds reach the recipient’s account. To enable it, please contact your PerlasPay manager.

POST Request Example

{
  "data": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0cmFuc2FjdGlvbklkIjoiOTYxNDY1Y2IiLCJwYXllckNvZGVNYXRjaGVzIjp0cnVlLCJpYXQiOjE0OTMyMDg0OTgsImV4cCI6MTQ5MzI5NDg5OH0"
}
Using your provided personal hash, you can verify the authenticity of the request.

Responding to a Callback

When receiving the callback request, respond with:

{ 
    "status": "success" 
}
🔹 Response time requirement: Your server must respond within 15 seconds with HTTP 200 OK. If not received, the request will be retried every 5 minutes.

Decoded Token Example

{
    "transactionId": "609103889",
    "status": "received",
    "confirmedDate": "2025-12-02 20:40:47",
    "type": "payment",
    "service": "pis",
    "amount": "0.01",
    "creditorName": "UAB Perlas Finance",
    "creditorAccountNumber": "LT487300010092650876",
    "paymentPurpose": "19PP1764700798B0B test mokejimas 609103889",
    "payerAccountNumber": "LT487300010092650876",
    "payerCode": "5366Nub/j7767UB3hf+8cw==", // It is returned only if it was provided during initiation.
    "payerName": "5366Nub/j7767UB3hf+8cw==",
    "payerBic": "CBVILT2X"
}
One-click payments
The feature must enabled for your project by Mip Team (contact your sales manager regarding this), and only works when additional parameter "ocpClientId" is used in the dataToken. The first time the payer makes a payment in your project, they will be asked if they wish to save his IBAN information for faster future payments for the next 180 days. If the payer agrees to save this data (it will be tied to the userIdentity parameter that you provide), the next time they make the payment in your project they will only have to sign the payment once, without additionally logging into their bank account first, and in the case of SEB bank they can confirm the payment without signing it all if the payment amount is up to 30 EUR. This feature is extremely useful for recurring payers, and improves their experience even further.

This solution currently is available only with Swedbank, SEB, Luminor in all Baltic countries and Šiaulių bankas in Lithuania.

JWT PAYLOAD CLAIM	FORMAT	DESCRIPTION
ocpClientId	string	OPTIONAL. This parameter used to identify user transactions in the self service portal and for saving information for faster payment.
ocpClientAccount	string	OPTIONAL. This parameter is used to pass payer's account number (IBAN) for one click payment option.
{
"projectId": "1",
"amount": "9.99",
"paymentPurpose": "Order #1",
"transactionId": "TRANS1",
"currency": "EUR",
"returnUrl": "https://return.url",
"ocpClientId": "12345",
"bank": "HABALT22"
}
Note you can even skip another step by providing payer IBAN number with "ocpClientAccount", (You get this information after first payment) - this will enable one click payment, as the payer will no longer have to select the account from which he wants to make the payment. Just make sure that the payer sees their saved account on your website, and have the option to not select the account to make the payment from a different account, in such case just skip the "ocpClientAccount" parameter.

{
"projectId": "1",
"amount": "9.99",
"paymentPurpose": "Order #1",
"transactionId": "TRANS1",
"currency": "EUR",
"returnUrl": "https://return.url",
"ocpClientId": "12345",
"ocpClientAccount": "LT******************"
"bank": "HABALT22"
}
Note you can skip the step about saving the token on our side and implement it within your own checkout flow. You just need to pass the text you display to the customer into the ocpApproved parameter.

{
"projectId": "1",
"amount": "9.99",
"paymentPurpose": "Order #1",
"transactionId": "TRANS1",
"currency": "EUR",
"returnUrl": "https://return.url",
"ocpClientId": "12345",
"bank": "HABALT22",
"ocpApproved": "I want to save my data for faster next payment."
}
Skip & Pay
After the first successful customer payment, you can implement the "Skip & Pay" payment initiation and authorization directly on your website. Please refer to the following Swagger documentation for guidance view

Payer bank account verification
To use this additional parameter "payerCode" must be provided in the dataToken payload. If the payer code matches with the code provided by the bank, the payer will be able to continue the operation, if not - operation will be canceled and payer will not be able to finish it.

This solution currently is available only with only works with Swedbank, SEB, Luminor, Šiaulių banks and Urbo bank.

JWT PAYLOAD CLAIM	FORMAT	DESCRIPTION
payerCode	encrypted string	OPTIONAL. Provided personal code will be used to check information.
payerName	encrypted string	OPTIONAL. Provided personal code will be used to check information.
payerSurname	encrypted string	OPTIONAL. Provided personal code will be used to check information.
{
"projectId": "1",
"amount": "9.99",
"paymentPurpose": "Order #1",
"transactionId": "TRANS1",
"currency": "EUR",
"returnUrl": "https://return.url",
"payerCode": "5366Nub/j7767UB3hf+8cw==",
"bank": "HABALT22"
}
Algorithm for payerCode encryption:
Cipher method - aes-256-cbc
Passphrase - first 64 symbols from projectKEY sha256 hash.
IV (Initialization Vector) - first 32 symbols from projectKEY sha256 hash.
Encrypted value aditionally encoded with base64

Code example PHP:

    $projectKey = '667gv7665353@Xnd';
    $payerCode = '48312112222';
    $passphrase = substr(hash('sha256', $projectKey), 0, 64);
    $IV = substr(hash('sha256', $projectKey), 0, 32);
    $encrypted = openssl_encrypt($payerCode, 'aes-256-cbc', hex2bin($passphrase), 0, hex2bin($IV));        
    Result: $encrypted - 5366Nub/j7767UB3hf+8cw==
OPTIONAL: Code example PHP (decryption):

    $encryptedPayerCode = '5366Nub/j7767UB3hf+8cw==';
    $decrypted = openssl_decrypt($encryptedPayerCode, 'aes-256-cbc', hex2bin($passphrase), 0, hex2bin($IV));
    Result: $decrypted - 48312112222
We may detect that the payment was made from a bank account that does not belong to the specified person. In such a case, we will issue an automatic refund and send server-side information indicating that the transaction has been cancelled and refunded.

{
    "type": "payment",
    "transactionId": "1111",
    "status": "refund",
    "comment": "PSU verification has failed",
    "amount": "0.01",
    "creditorName": "Vardas Pavardė",
    "creditorAccountNumber": "LT487300010092650876",
    "paymentPurpose": "Payment for services",
    "confirmedDate": "2025-04-26 12:08:18.03",
    "payerAccountNumber": "LT487300010092650876",
    "payerCode": "5366Nub/j7767UB3hf+8cw=="
}
Payer authorization

To use this additional parameter "payerCode" and "payerAuthorization" must be provided in the dataToken payload. If the payer code matches with the code provided by the bank, you will receive a successful callback.

This solution currently is available only with only works with Swedbank, SEB, Luminor, Šiaulių banks and Urbo bank.

JWT PAYLOAD CLAIM	FORMAT	Mandatory
projectId	string	Yes
transactionId	string	Yes
bank	string	Optional
returnUrl	string	Yes
payerCode	encrypted string	Yes
payerName	encrypted string	No
payerSurname	encrypted string	No
payerAuthorization	boolean	Yes
{
"projectId": "1",
"transactionId": "TRANS1",
"returnUrl": "https://return.url",
"bank": "HABALT22",
"payerCode": "5366Nub/j7767UB3hf+8cw==",
"payerName": "5366Nub/j7767UB3hf+8cw==",
"payerSurname": "5366Nub/j7767UB3hf+8cw==",
"payerAuthorization": true
}
Algorithm for payerCode encryption:
Cipher method - aes-256-cbc
Passphrase - first 64 symbols from projectKEY sha256 hash.
IV (Initialization Vector) - first 32 symbols from projectKEY sha256 hash.
Encrypted value aditionally encoded with base64

Code example PHP:

    $projectKey = '667gv7665353@Xnd';
    $payerCode = '48312112222';
    $passphrase = substr(hash('sha256', $projectKey), 0, 64);
    $IV = substr(hash('sha256', $projectKey), 0, 32);
    $encrypted = openssl_encrypt($payerCode, 'aes-256-cbc', hex2bin($passphrase), 0, hex2bin($IV));        
    Result: $encrypted - 5366Nub/j7767UB3hf+8cw==
OPTIONAL: Code example PHP (decryption):

    $encryptedPayerCode = '5366Nub/j7767UB3hf+8cw==';
    $decrypted = openssl_decrypt($encryptedPayerCode, 'aes-256-cbc', hex2bin($passphrase), 0, hex2bin($IV));
    Result: $decrypted - 48312112222
After either successful personal payer code verification, a callback will be provided Server Side Callback# :

{
  "type": "authorization",
  "transactionId": "1111",
  "status": "success",
  "confirmedDate": "2025-04-26 12:08:18.03",
  "payerCode": "5366Nub/j7767UB3hf+8cw=="
}
After either failed personal payer code verification, a callback will be provided Server Side Callback# :

{
  "type": "authorization",
  "transactionId": "1111",
  "status": "failed",
  "confirmedDate": "2025-04-26 12:08:18.03",
  "payerCode": "5366Nub/j7767UB3hf+8cw=="
}
Account Information Service

By default, this service is inactive. To enable it, please contact your PerlasPay manager to sign the necessary agreement. The account information service can be initiated by including the additional parameter "service": "ais".

To obtain the most up-to-date list of banks that support the Account Information Service, please use our Banks API.

Payload Format (JWT)
The account information service requires the operation details to be supplied in the payload as shown below:

Parameter	Mandatory	Description	Limitation
projectId	Yes	PerlasPay project ID	INT (>0)
transactionId	Yes	Unique transaction ID	Alphanumeric, 36 characters max
returnUrl	Yes	URL for redirection after payment	500 characters max
service	Yes	Must be "ais" for this service	
payerCode	No	encrypted string	
bank	No	Preferred bank (BIC)	List of banks supported View
payerConsent	No	The consent has been given on your side.	
Example JWT Payload
{
  "projectId": 1,
  "transactionId": "123456T",
  "returnUrl": "https://your_client-redirect_url_here.domain",
  "service": "ais",
  "payerCode": "5366Nub/j7767UB3hf+8cw==",
  "bank": "HABALT22",
  "payerConsent": "The payment initiation service is provided by UAB "Perlas Finance". By using this service, you confirm that you have read the rules."
}
Callbacks
The callbacks will include both successful and canceled ones.

Once the Account holder has successfully authorized access to their account data and the bank has provided the final status, the payer will be redirected to the returnUrl you specified.

Cancel: The user cancels, and the URL receives ?cancel=1:

https://yourwebsite.com/?cancel=1
Success: Signed successfully, and the token is appended:

https://yourwebsite.com/?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0cmFuc2FjdGlvbklkIjoiNDk3MTIzNDc0Iiwic3RhdHVzIjoic2lnbmVkIn0.Md71jlnz-OFwXxftbJEcg8E-XbxRPnb3L9WcZzlJKCQ
Server side
As soon as we receive confirmation from the bank that the agreement has been successfully signed, we will immediately send a POST request to your specified callback URL containing a JSON payload:

POST Request Example
{
  "data": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0cmFuc2FjdGlvbklkIjoiMzkzNDYwMjU1Iiwic3RhdHVzIjoic3VjY2VzcyIsImNvbmZpcm1lZERhdGUiOiIyMDI1LTExLTEwIDE2OjQ4OjM1Iiwic2VydmljZSI6ImFpcyIsImNvbnNlbnRJZCI6IjUyNWZiNGEwLWJlNDQtMTFmMC04MjI2LWYzYWI1YzNmZDk0NSIsImFjY291bnROdW1iZXIiOiJMVDExMTEwMDAxMDAxMDI2OTM2MiJ9.qU5emlSCGaHrQs83vW_G1x3pU36owOb7k8JVunxZdc0"
}
Using your provided personal hash, you can verify the authenticity of the request.

Responding to a Callback
When receiving the callback request, respond with:

{ 
    "status": "success" 
}
🔹 Response time requirement: Your server must respond within 15 seconds with HTTP 200 OK. If not received, the request will be retried every 5 minutes.

Decoded Token Example
{
    "transactionId": "393460255",
    "status": "success",
    "confirmedDate": "2025-11-10 16:48:35",
    "service": "ais",
    "consentId": "525fb4a0-be44-11f0-8226-f3ab5c3fd945",
    "accountNumber": "LT111100010010269362"
}
Notes
The server-side callback is the only confirmation of a successful signet.
Ensure your system correctly handles retries for missing responses.
Use the provided personal hash to verify token integrity.
Transaction Report
Generating a report
To generate a report, you need to follow the Swagger documentation at Swagger — endpoint: POST api/v1/generate-account-report

Payload Format (JWT)

Parameter	Mandatory	Description	Limitation
projectId	Yes	PerlasPay project ID	INT (>0)
consentId	Yes	Unique consent ID	Alphanumeric, 191 characters max
startDate	Yes	Transaction report start date	(ISO format)
endDate	Yes	Transaction report end date (Max up to 1 month)	(ISO format)
includeBalance	No	Include account balance	Boolean
{
    "projectId": 19,
    "consentId": "d1cc57d0-c0a7-11f0-98a0-75f1c7c3e972",
    "startDate": "2025-01-13",
    "endDate": "2025-03-16",
    "includeBalance": true
}
Download a report
To retrieve the report, you need to follow the Swagger documentation at Swagger — endpoint: GET api/v1/account-report

Payload Format (JWT)

Parameter	Mandatory	Description	Limitation
projectId	Yes	PerlasPay project ID	INT (>0)
reportId	Yes	Unique report ID	Alphanumeric, 191 characters max
{
    "projectId": 19,
    "reportId": "d1cc57d0-c0a7-11f0-98a0-75f1c7c3e972",
}
Report formats examples

SEB Transaction JSON example:

[
  {
    "endToEndIdentification": "567652143",
    "instructedAmount": {
      "currency": "EUR",
      "amount": "0.01"
    },
    "creditorName": "Petras Petraitis",
    "creditorAccount": {
      "iban": "LT599386327515536498"
    },
    "remittanceInformationUnstructured": "MP721760426368 test mokejimas 567652143",
    "transactionId": "YWtAZnJvbnRpdC5ka19pYnNVc2VyMV9DQlZJTFQyWF8xNzYwNDI2MzY5OTcy-T",
    "transactionAmount": {
      "currency": "EUR",
      "amount": "0.01"
    },
    "bookingDate": "2025-10-14",
    "valueDate": "2025-10-14",
    "transactionReferenceNumber": "RO1034013454",
    "entryReference": "17604000000000095041",
    "transactionPaymentInfId": "7b8409b7-34cd-4857-8183-a342d205230b",
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "debtorAddress": "Random street 2, Lithuania",
    "bankTransactionCode": "PMNT-ICDT-ESCT"
  },
  {
    "endToEndIdentification": "253819181",
    "instructedAmount": {
      "currency": "EUR",
      "amount": "0.01"
    },
    "creditorName": "Petras Petraitis",
    "creditorAccount": {
      "iban": "LT599386327515536498"
    },
    "remittanceInformationUnstructured": "MP231760428656 test mokejimas 567652146",
    "transactionId": "YWtAZnJvbnRpdC5ka19pYnNVc2VyMV9DQlZJTFQyWF8xNzYwNDI4NjcxNTY1-T",
    "transactionAmount": {
      "currency": "EUR",
      "amount": "0.01"
    },
    "bookingDate": "2025-10-14",
    "valueDate": "2025-10-14",
    "transactionReferenceNumber": "RO4585929448",
    "entryReference": "17604000000000095042",
    "transactionPaymentInfId": "7dac97e3-2fe5-49e5-a03e-0c62f08b5520",
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "debtorAddress": "Random street 2, Lithuania",
    "bankTransactionCode": "PMNT-ICDT-ESCT"
  }
]
SEB Balance JSON example:

[
  {
    "balanceType": "interimBooked",
    "balanceAmount": {
      "currency": "EUR",
      "amount": "984.34"
    }
  },
  {
    "balanceType": "interimAvailable",
    "balanceAmount": {
      "currency": "EUR",
      "amount": "984.34"
    }
  },
  {
    "balanceType": "interimBooked",
    "creditLimitIncluded": true,
    "balanceAmount": {
      "currency": "EUR",
      "amount": "984.34"
    }
  }
]
Swedbank Transaction JSON example:

[
  {
    "transactionId": "202511117772058-1",
    "originCode": "K1",
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "transactionAmount": {
      "currency": "EUR",
      "amount": "-9.95"
    },
    "transactionDate": "2025-11-09",
    "bookingDate": "2025-11-11",
    "valueDate": "2025-11-11",
    "bankTransactionCode": "PMNT-CCRD-POSD",
    "remittanceInformationUnstructured": "PIRKINYS MP721760426368 test mokejimas 567652143"
  },
  {
    "transactionId": "202511117772058-1",
    "originCode": "MOB",
    "creditorName": "Petras Petraitis",
    "creditorAccount": {
      "iban": "LT599386327515536498"
    },
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "transactionAmount": {
      "currency": "EUR",
      "amount": "2000.00"
    },
    "transactionDate": "2025-11-11",
    "bookingDate": "2025-11-11",
    "valueDate": "2025-11-11",
    "bankTransactionCode": "PMNT-RCDT-BOOK",
    "remittanceInformationUnstructured": "Pervedimas tarp savo sąskaitų"
  },
  {
    "transactionId": "202511117772058-1",
    "originCode": "OBN",
    "endToEndId": "NOTPROVIDED",
    "creditorName": "Paysera LT, UAB",
    "creditorAccount": {
      "iban": "LT599386327515536498"
    },
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "transactionAmount": {
      "currency": "EUR",
      "amount": "-1681.40"
    },
    "transactionDate": "2025-11-11",
    "bookingDate": "2025-11-11",
    "valueDate": "2025-11-11",
    "bankTransactionCode": "PMNT-ICDT-ESCT",
    "remittanceInformationUnstructured": "MP721760426368 test mokejimas 567652143"
  },
]
Swedbank Balance JSON example:

[
  {
    "balanceType": "interimAvailable",
    "balanceAmount": {
      "currency": "EUR",
      "amount": "181.19"
    },
    "referenceDate": "2025-11-12"
  },
  {
    "balanceType": "interimBooked",
    "balanceAmount": {
      "currency": "EUR",
      "amount": "235.73"
    },
    "referenceDate": "2025-11-12"
  }
]
Luminor Transaction JSON example:

[
  {
    "transactionId": "5301845292",
    "entryReference": "LTUP11825316C689",
    "endToEndId": "500901717",
    "bookingDate": "2025-10-28",
    "valueDate": "2025-10-28",
    "transactionAmount": {
      "currency": "EUR",
      "amount": "-0.01"
    },
    "instructedAmount": {
      "currency": "EUR",
      "amount": "-0.01"
    },
    "currencyExchange": {
      "targetCurrency": "EUR"
    },
    "creditorName": "Petras Petraitis",
    "creditorAccount": {
      "iban": "LT599386327515536498"
    },
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "bankTransactionCode": "PMNT/ICDT/DMCT",
    "remittanceInformationUnstructured": "MP781761634420 test mokejimas 500901717",
    "remittanceInformationStructured": {
      "reference": null,
      "referenceType": null,
      "referenceIssuer": null
    },
    "counterpartyId": null
  },
  {
    "transactionId": "5323415964",
    "entryReference": "LTUP11825316C689",
    "endToEndId": "435805621",
    "bookingDate": "2025-11-12",
    "valueDate": "2025-11-12",
    "transactionAmount": {
      "currency": "EUR",
      "amount": "-0.01"
    },
    "instructedAmount": {
      "currency": "EUR",
      "amount": "-0.01"
    },
    "currencyExchange": {
      "targetCurrency": "EUR"
    },
    "creditorName": "Petras Petraitis",
    "creditorAccount": {
      "iban": "LT599386327515536498"
    },
    "debtorName": "Petras Petraitis",
    "debtorAccount": {
      "iban": "LT599386327515536498"
    },
    "bankTransactionCode": "PMNT/ICDT/DMCT",
    "remittanceInformationUnstructured": "MP141762956747 test mokejimas 435805621",
    "remittanceInformationStructured": {
      "reference": null,
      "referenceType": null,
      "referenceIssuer": null
    },
    "counterpartyId": null
  }
]
Luminor Balance JSON example:

[
  {
    "balanceAmount": {
      "currency": "EUR",
      "amount": 10.59
    },
    "balanceType": "interimAvailable",
    "creditLimitIncluded": false
  },
  {
    "balanceAmount": {
      "currency": "EUR",
      "amount": 10.59
    },
    "balanceType": "interimBooked",
    "creditLimitIncluded": null
  }
]
Artea Transaction JSON example:

[
    {
        "transactionId":"1",
        "entryReference":"1",
        "endToEndId":"846317089",
        "bookingDate":"2025-10-08",
        "valueDate":"2025-10-08",
        "transactionAmount":{
            "currency":"EUR",
            "amount":"0.01"
        },
        "currencyExchange":[
            {
                "exchangeRate":"null",
                "quotationDate":"2025-12-04"
            }
        ],
        "creditorName":"UAB Perlas Finance",
        "creditorAccount":{
            "iban":"LT1240200200000646444",
            "currency":"EUR"
        },
        "debtorName":"null",
        "debtorAccount":{
            "iban":"LT111100010010269362",
            "currency":"EUR"
        },
        "remittanceInformationUnstructured":"MP281759927898 test mokejimas 846317089",
        "bankTransactionCode":"PMNT-ICDT-ESCT"
    }
]
Artea Balance JSON example:

[
    {
        "balanceAmount":{
            "currency":"EUR",
            "amount":"19999999.70"
        },
        "balanceType":"closingBooked",
        "creditLimitIncluded":false,
        "referenceDate":"2025-12-04"
    },
    {
        "balanceAmount":{
            "currency":"EUR",
            "amount":"19999999.70"
        },
        "balanceType":"interimAvailable",
        "creditLimitIncluded":true,
        "referenceDate":"2025-12-04"
    }
]
Recurring (Periodic) Payments

Service Activation
By default, the recurring payment service is disabled. To activate it:

Contact your manager to initiate and sign the agreement.
Upon signing, the service will be enabled.
You must include "service": "pps" in your request payload to initiate a recurring payment agreement.
Supported Banks
To retrieve the latest list of banks compatible with recurring payment agreements, use the Banks API.

Payload Format (JWT)
To execute a recurring payment, provide the following in your JWT payload:

Claim	Format	Description	Required
projectId	integer	Unique project ID provided by MIP	Yes
transactionId	string(36)	Unique per payment initiation. Max 36 characters.	Yes
amount	double	Amount of payment initiation	Yes
currency	string	Payment currency	Yes
frequency	string	Frequency of payment. All banks support Monthly, Weekly, Daily, Annual.	Yes
startDate	string	Date of first payment (ISO format)	Yes
endDate	string	Agreement end date (Required for Artea and SEB)	No️
paymentPurpose	string(100)	Purpose of payment (35 characters max for Revolut)	Yes
returnUrl	string	Redirect URL post-operation. If omitted, user will not be redirected.	No
service	string	Must be "pps" for this service	Yes
Example JWT Payload
{
  "projectId": 1,
  "transactionId": "123456T",
  "amount": 0.01,
  "currency": "EUR",
  "frequency": "Weekly",
  "startDate": "2024-11-05",
  "endDate": "2024-12-07",
  "paymentPurpose": "Payment purpose",
  "service": "pps",
  "returnUrl": "https://your_client-redirect_url_here.domain"
}
Callbacks
Client-Side
On Success: We redirects to the clientRedirectUrl with a token parameter.

Example:

https://myproject.com/redirect?token=<JWT_TOKEN>
Token Payload Example

{
    "type": "periodic_payment",
    "transactionId": "901651527",
    "status": "success",
    "action": "signed",
    "frequency": "Monthly",
    "startDate": "2025-07-10",
    "endDate": null,
    "amount": "0.01",
    "paymentPurpose": "MP421751883872 test mokejimas 901651527",
    "payerAccountNumber": "LT307300000000000000",
    "confirmedDate": "2025-07-07 13:27:14"
}
IMPORTANT: Always check status === "success" inside the token to update your internal order status.

Server-Side
We will send a POST request to your callback URL after successful agreement signing:

{
  "data": "<JWT_TOKEN>"
}
Example Decoded Token Payload

{
    "type": "periodic_payment",
    "transactionId": "901651527",
    "status": "success",
    "action": "signed",
    "frequency": "Monthly",
    "startDate": "2025-07-10",
    "endDate": null,
    "amount": "0.01",
    "paymentPurpose": "MP421751883872 test mokejimas 901651527",
    "payerAccountNumber": "LT307300000000000000",
    "confirmedDate": "2025-07-07 13:27:14"
}
Cancelation
Payer can cancel the agreement via internet banking.
On payment date, we checks agreement status:
If canceled → A callback is sent with status cancelled.
If cant check payment status → A callback is sent with status status_unknown.
Example Canceled Agreement Payload

{
    "type": "periodic_payment",
    "transactionId": "901651527",
    "status": "success",
    "action": "cancelled",
    "frequency": "Monthly",
    "startDate": "2025-07-10",
    "endDate": null,
    "amount": "0.01",
    "paymentPurpose": "MP421751883872 test mokejimas 901651527",
    "payerAccountNumber": "LT307300000000000000",
    "confirmedDate": "2025-07-07 13:27:14"
}
Get periodic payment status
To verify the current status of a recurring payment, make a GET request to the API endpoint at: https://mip-pay.dataop.lt/api/v1/periodic-payment, including a signed JWT token in the request. The periodic payment status will be updated accordingly based on this call.

Example JWT payload:

{
    "projectId": 11,
    "transactionId": "112045588"
}
Success response example:

{
    "transactionId": "112045588",
    "status": "active"
}
Note: The status parameter may be set to one of the following values: active, cancelled, finished, status_unknown.
Notes
We only informs about agreement statuses, not payment statuses.
To track payments, you must check your bank account directly.
Implement and test both client and server callbacks before going live.
Payer email notification

You must contact us to enable this functionality for you.

Remind
This function allows payers to receive an email reminder if a transaction has not been paid after a certain period of time. To use it, you will need to provide the encrypted payer’s email address.

Note: encryption method is the same described in payerCode

JWT PAYLOAD CLAIM	FORMAT	DESCRIPTION	Required
notifications.orderId	string (35)	Your system order identifier. We will check whether such an order is still unpaid. If the value is not provided, we will check using the transactionId.	No
notifications.email	encrypted string	Email for sending notifications (encrypted).	Yes
notifications.remind	boolean	If true, system sends reminders; if false, no reminders.	Yes
{
    "projectId": 1,
    "amount": 0.01,
    "paymentPurpose": "test mokejimas 818595655",
    "transactionId": 818595655,
    "currency": "EUR",
    "returnUrl": "https://return.url",
    "notifications": {
        "orderId": 818595655,
        "email": "6iPvtnu6iW5Kk3/T2qrurw==",
        "remind": true
    }
}
Payout initiation service

To activate this service please contact your account manager.

To initiate a payout, send a POST request to the API endpoint at: https://mip-pay.dataop.lt/api/v1/payout/initiate including a signed JWT access token in the request.

JWT Token Parameters

Parameter	Mandatory	Description	Limitation
projectId	Yes	PerlasPay project ID	INT (>0)
amount	Yes	Payment amount	Decimal (two decimal places)
paymentPurpose	Yes	Purpose of the payment	100 characters max
transactionId	Yes	Unique transaction ID	Alphanumeric, 36 characters max
currency	Yes	Currency	EUR
receiverName	Yes	Receiver name	encrypted string (100 characters max)
receiverAccountNumber	Yes	Receiver account number	34 characters max
Example Request

{
  "projectId": "1",
  "amount": "9.99",
  "paymentPurpose": "Order #1",
  "transactionId": "TRANS1",
  "currency": "EUR",
  "receiverName": "cej4lEq53PbXrvjjW26yEToFUW8YXmX6nywe+xCeJNY=",
  "receiverAccountNumber": "LT12302002000000000"
}
Callback Server side
When a payout transaction reaches a final status, we will immediately send a POST request to your specified callback URL containing a JSON payload. The callback is sent for both successful and failed transactions.

Possible statuses:

success — payout has been completed successfully.
failed — payout was rejected by the bank or timed out.
POST Request Example
{
  "data": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0cmFuc2FjdGlvbklkIjoiOTU1MzY0Mjg5Iiwic3RhdHVzIjoic3VjY2VzcyIsImNvbmZpcm1lZERhdGUiOiIyMDI2LTAxLTE0IDIzOjI1OjA1IiwidHlwZSI6InBheW91dCIsInNlcnZpY2UiOiJwaXMiLCJhbW91bnQiOiIwLjAxIiwicGF5bWVudFB1cnBvc2UiOiIxOVBQMTc2ODQyNTg5NU5URSB0ZXN0IHBheW91dCA5NTUzNjQyODUifQ._creoFNLaY_vLXfKNVgJMqtKhTYGAPNzwyO1-mKmY60"
}
Using your provided personal hash, you can verify the authenticity of the request.

Responding to a Callback
When receiving the callback request, respond with:

{
    "status": "success"
}
🔹 Response time requirement: Your server must respond within 15 seconds with HTTP 200 OK. If not received, the request will be retried every 5 minutes.

Decoded Token Example (success)
{
    "transactionId": "955364289",
    "status": "success",
    "confirmedDate": "2026-01-14 23:25:05",
    "type": "payout",
    "service": "pis",
    "amount": "0.01",
    "paymentPurpose": "19PP1768425895NTE test payout 955364285"
}
Decoded Token Example (failed)
{
    "transactionId": "955364289",
    "status": "failed",
    "confirmedDate": null,
    "type": "payout",
    "service": "pis",
    "amount": "0.01",
    "paymentPurpose": "19PP1768425895NTE test payout 955364285"
}
Refund initiation service

To activate this service please contact your account manager.

To initiate a refund, send a POST request to the API endpoint at: https://mip-pay.dataop.lt/api/v1/refund/initiate including a signed JWT access token in the request.

JWT Token Parameters

Parameter	Mandatory	Description	Limitation
projectId	Yes	PerlasPay project ID	INT (>0)
transactionId	Yes	Unique transaction ID	Alphanumeric, 36 characters max
Example Request

{
  "projectId": "1",
  "transactionId": "TRANS1",
}
Callback Server side
When a refund transaction reaches a final status, we will immediately send a POST request to your specified callback URL containing a JSON payload. The callback is sent for both successful and failed transactions.

Possible statuses:

success — refund has been completed successfully.
failed — refund was rejected by the bank or timed out.
Responding to a Callback
When receiving the callback request, respond with:

{
    "status": "success"
}
🔹 Response time requirement: Your server must respond within 15 seconds with HTTP 200 OK. If not received, the request will be retried every 5 minutes.

Decoded Token Example (success)
{
    "transactionId": "955364289",
    "status": "success",
    "confirmedDate": "2026-01-14 23:25:05",
    "type": "refund",
    "service": "pis",
    "amount": "0.01",
    "paymentPurpose": "19PP1768425895NTE refund 955364285"
}
Decoded Token Example (failed)
{
    "transactionId": "955364289",
    "status": "failed",
    "confirmedDate": null,
    "type": "refund",
    "service": "pis",
    "amount": "0.01",
    "paymentPurpose": "19PP1768425895NTE refund 955364285"
}
For more information, contact **info@perlasmip.lt.**