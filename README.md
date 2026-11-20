# GharKaSwad -- Backend Server

Backend API for **GharKaSwad**, a homemade-food marketplace connecting
customers with nearby HomeChefs.

The backend is the single source of truth for authentication, customer
and Chef profiles, food listings, location-based discovery, orders,
subscriptions, rewards, wallets, payments, notifications, and Admin
operations.

> **Repository-specific note:** Verify exact scripts,
> environment-variable names, route prefixes, and folder names against
> this repository's `package.json` and source code before committing
> this README. Do not add credentials to this file.

## Table of Contents

-   [Project Overview](#project-overview)
-   [Core Roles](#core-roles)
-   [Technology Stack](#technology-stack)
-   [Features and Modules](#features-and-modules)
-   [Prerequisites](#prerequisites)
-   [Installation](#installation)
-   [Environment Variables](#environment-variables)
-   [Running the Server](#running-the-server)
-   [Project Structure](#project-structure)
-   [Business Rules](#business-rules)
-   [Location and Nearby Chef
    Discovery](#location-and-nearby-chef-discovery)
-   [Real-Time Order Notifications](#real-time-order-notifications)
-   [Security Guidelines](#security-guidelines)
-   [Testing and Verification](#testing-and-verification)
-   [Deployment Notes](#deployment-notes)
-   [Troubleshooting](#troubleshooting)

## Project Overview

GharKaSwad helps customers discover homemade food prepared by local
HomeChefs. Customers can browse available food, select a Chef, place
instant orders, or subscribe to meals for a flexible duration.

HomeChefs manage their profiles, food items, orders, subscriptions, and
earnings. Admins manage customers and HomeChefs, review Chef
applications, and oversee platform operations.

The Customer, HomeChef, and Admin applications communicate with this
backend. They must use the same API contracts and database records
rather than maintaining separate copies of business data.

## Core Roles

  -----------------------------------------------------------------------
  Role                                Responsibilities
  ----------------------------------- -----------------------------------
  Customer                            Browse food and Chefs, manage
                                      addresses, place orders, manage
                                      subscriptions, earn and redeem
                                      rewards

  HomeChef                            Manage Chef profile and food,
                                      receive and process orders, manage
                                      subscription meals, view earnings
                                      and commission wallet

  Admin                               Manage customers and HomeChefs,
                                      approve Chef applications, oversee
                                      platform operations and review
                                      business records
  -----------------------------------------------------------------------

Access to protected resources must be enforced by the backend. Hiding a
frontend page is not sufficient authorization.

## Technology Stack

The project context includes the following technologies. Confirm exact
versions and enabled integrations in `package.json` and the source code.

-   **Node.js** -- JavaScript runtime
-   **Express.js** -- HTTP API framework
-   **MongoDB** -- Database
-   **Mongoose** -- MongoDB object modeling
-   **JWT** -- Authentication, if used by the current implementation
-   **Socket.IO** -- Real-time communication, if enabled
-   **Cloudinary** -- Image and media storage, if configured
-   **Razorpay** -- Online payment integration, if configured
-   **Brevo / SMTP** -- Email and OTP delivery, if configured

## Features and Modules

Depending on the current implementation, backend modules may include:

-   Authentication and role-based access control
-   Customer profile and address management
-   HomeChef profile registration and Admin approval
-   Food categories and food management
-   Location-based Chef and food discovery
-   Cart and instant orders
-   Flexible meal subscriptions
-   Loyalty points and reward coupons
-   Customer reward wallet
-   Chef earnings wallet
-   Chef commission wallet
-   Online payment and Cash on Delivery workflows
-   Real-time order notifications
-   Admin customer and HomeChef management
-   Analytics, audit logs, and platform settings

Only APIs actually implemented in the repository should be documented as
available endpoints.

## Prerequisites

Install the following before running the backend:

-   Node.js version supported by the project
-   npm (or the package manager used by the repository)
-   MongoDB local instance or MongoDB Atlas database
-   Git

Optional services, depending on enabled features:

-   Cloudinary account
-   Razorpay account and API keys
-   Brevo or SMTP email credentials

Check the project's `package.json` and deployment configuration for the
required Node.js version.

## Installation

Clone the repository and enter the backend directory:

``` bash
git clone <YOUR_BACKEND_REPOSITORY_URL>
cd <YOUR_BACKEND_DIRECTORY>
```

Install dependencies:

``` bash
npm install
```

Create a local environment file:

``` powershell
# Windows PowerShell
Copy-Item .env.example .env
```

If the repository does not contain `.env.example`, create `.env` using
the variable names referenced by the source code. Do not guess variable
names.

Add the required local configuration to `.env` before starting the
server.

## Environment Variables

The exact names are defined by the backend source code. The following
table is a configuration checklist, not a claim that every variable
already exists in the project.

  -----------------------------------------------------------------------
  Configuration                       Purpose
  ----------------------------------- -----------------------------------
  Server port                         Port on which Express listens

  MongoDB URI                         Database connection string

  JWT secret / key                    Signs and verifies authentication
                                      tokens, if JWT is used

  Client origin(s)                    Allowed frontend origins for CORS

  Cloudinary credentials              Image upload and media management,
                                      if enabled

  Payment gateway keys                Online payment creation and
                                      verification, if enabled

  Email provider credentials          OTP, verification, and notification
                                      emails, if enabled

  Cookie settings                     Secure session cookies, if the
                                      application uses cookies
  -----------------------------------------------------------------------

Example `.env` template --- replace names with the exact names used in
the code:

``` env
PORT=5000
NODE_ENV=development

MONGODB_URI=

JWT_SECRET=

CLIENT_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

BREVO_API_KEY=
EMAIL_FROM=
```

**Never commit `.env` to Git.** Keep `.env.example` limited to empty
placeholders and safe, non-secret defaults. Rotate any credential that
has accidentally been committed or shared.

## Running the Server

First inspect the scripts in `package.json`:

``` bash
npm run
```

Use the script names defined by the repository. Common examples are:

``` bash
npm run dev
```

For production, use the configured start script, for example:

``` bash
npm start
```

Do not add or assume a script that is not present in `package.json`.

When the server starts successfully, it should connect to MongoDB and
listen on the configured port. Use the actual health-check route if the
project provides one.

## Project Structure

The exact structure may differ. A typical Express backend is organized
as follows:

``` text
server/
├── src/
│   ├── config/          # Database and third-party service configuration
│   ├── controllers/     # HTTP request handlers
│   ├── middleware/      # Authentication, authorization and validation
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic and integrations
│   ├── sockets/         # Socket.IO setup and event handlers
│   ├── utils/           # Shared utilities and helpers
│   └── app.js           # Express application setup
├── server.js            # HTTP server and Socket.IO startup, if used
├── package.json
├── .env.example
└── README.md
```

Treat the actual repository structure as authoritative. Do not create
duplicate folders just to match this example.

## Business Rules

The following are important GharKaSwad business rules agreed for the
platform. Confirm that the current backend implementation enforces them
before treating this section as a production specification.

### HomeChef approval

-   A newly registered HomeChef must remain pending until Admin
    approval.
-   Pending, rejected, suspended, or inactive Chefs must not appear as
    orderable options.
-   Only eligible and approved Chefs can receive new orders.
-   Approval and rejection actions should be authorized and auditable.

### Customer discovery and Chef ownership

-   Customer discovery should use the customer's location and the Chef's
    stored location to show relevant nearby Chefs.
-   When a customer selects a particular Chef's food, the order
    recipient must be resolved by the backend from the trusted
    Food-to-Chef relationship.
-   Do not trust a Chef ID supplied by the browser as proof of food
    ownership.

### Orders and fulfillment

-   Support the fulfillment options implemented by the application, such
    as Chef delivery and customer pickup.
-   Preserve order status history and payment status.
-   Rejected or cancelled orders must not create completed-order
    commission revenue.
-   Do not silently remove existing customer commitments when an account
    is suspended.

### Flexible subscriptions

-   Subscription duration can be selected flexibly rather than being
    restricted to fixed packages.
-   Meal selections and scheduled dates must follow the existing
    subscription model.
-   Skips, rejections, cancellations, and deliveries must be recorded at
    the relevant meal/date level.
-   Use the configured business timezone consistently for service dates
    and cut-off calculations.

### Rewards

-   Loyalty points should be awarded only when the applicable
    eligibility conditions are met.
-   Reward coupons must be unique, time-limited, and single-use if that
    is how the current implementation is configured.
-   Reward redemption must be tracked separately from ordinary paid
    orders and commission calculations.

### Wallets and commission

Keep these financial concepts separate:

-   **Chef Earnings Wallet:** amounts payable to the Chef.
-   **Chef Commission Wallet:** funds used for commission and applicable
    COD fee settlement.
-   **Admin/platform ledger:** records platform commission, fees,
    collections, expenses, refunds, and liabilities.

Important agreed rules:

-   Commission rate after the Chef's first accepted order benefit: 10%.
-   The first accepted order receives the agreed 0% commission benefit;
    it is consumed on acceptance and must not be granted twice under
    concurrent requests.
-   COD requires the agreed minimum commission-wallet floor of ₹50 to
    remain after applicable reservations and deductions.
-   The agreed COD handling fee is ₹20.
-   COD eligibility must be checked server-side using the order's actual
    commission estimate and applicable fee.
-   Online orders do not require the COD wallet floor.
-   The agreed online discount is ₹20; platform-funded discounts must be
    recorded separately and must not silently reduce the Chef's payable
    amount.
-   Capture or settle financial amounts only at the correct verified
    lifecycle stage.
-   Use idempotent financial operations and atomic updates/transactions
    where required.

Do not use this README as a substitute for the actual wallet ledger or
payment implementation. The code and verified tests determine the
current production behavior.

## Location and Nearby Chef Discovery

-   Store Chef location in the existing geospatial format.
-   MongoDB GeoJSON coordinates use `[longitude, latitude]`.
-   A `2dsphere` index is required for supported geospatial queries.
-   Customer location permission should be requested by the frontend;
    the backend should validate received coordinates.
-   Apply the configured discovery radius and eligibility filters in the
    discovery workflow.
-   A direct order notification to a selected Chef is based on food
    ownership, not a second nearby-Chef broadcast.

Do not expose precise customer coordinates publicly. Return only the
location information needed for the feature.

## Real-Time Order Notifications

When a customer places an order for a specific Chef's food:

1.  The backend validates the order and food availability.
2.  The backend resolves the owning Chef from the stored Food record.
3.  The order is created using the existing payment and order lifecycle.
4.  A notification is persisted so the Chef can see it later, even if
    offline.
5.  Socket.IO delivers the real-time event to the intended Chef when
    connected.
6.  The Chef can accept or reject according to the existing order
    workflow.

The backend should prevent duplicate notifications and duplicate
acceptance caused by retries or concurrent requests.

The frontend should play an incoming-order sound/ring only when it
receives the valid incoming-order event. Handle browser/mobile
notification and audio permissions appropriately; do not assume sound
can autoplay before the user grants or triggers the required permission.

## Security Guidelines

-   Keep secrets in environment variables.
-   Validate and sanitize incoming request data.
-   Enforce role and resource ownership checks on the server.
-   Protect Admin routes with Admin authorization middleware.
-   Never return password hashes, OTPs, JWT secrets, payment secrets, or
    private credentials.
-   Verify payment signatures/webhooks on the backend.
-   Do not trust payment success reported only by the frontend.
-   Apply rate limiting to sensitive authentication and OTP endpoints.
-   Configure CORS for known frontend origins.
-   Use HTTPS in production.
-   Keep financial and order operations idempotent.
-   Record sensitive Admin actions in audit logs where supported.

## Testing and Verification

Before releasing changes, verify at least:

-   Database connection and server startup
-   Customer, HomeChef, and Admin authentication
-   Role-based route protection
-   Chef approval and discovery eligibility
-   Customer address and location handling
-   Food ownership validation
-   Order creation and status transitions
-   Online payment verification and COD eligibility
-   Subscription meal lifecycle and skip rules
-   Reward eligibility and coupon redemption
-   Wallet reservations, captures, releases, and ledger consistency
-   Notification persistence and Socket.IO delivery
-   Admin customer and HomeChef management

Run the test commands that actually exist in `package.json`. Document
the verified commands and results here.

## Deployment Notes

Before deploying:

1.  Set production environment variables in the hosting provider.
2.  Configure the production MongoDB URI and network access.
3.  Add the deployed Customer, HomeChef, and Admin frontend origins to
    the CORS allowlist.
4.  Configure secure cookie settings if cookie-based authentication is
    used.
5.  Configure payment gateway production keys and verified webhook URLs
    if payments are enabled.
6.  Configure the production email provider if email/OTP features are
    enabled.
7.  Configure Cloudinary or the selected media storage service if
    uploads are enabled.
8.  Confirm the hosting platform supports the persistent Socket.IO
    connections required by the application.
9.  Ensure logs do not print secrets, OTPs, tokens, or sensitive
    personal information.
10. Test the deployed application using real end-to-end flows before
    accepting customers.

## Troubleshooting

### MongoDB connection fails

-   Verify the MongoDB URI.
-   Check database user credentials and network/IP access.
-   Confirm the database service is running.
-   Check DNS/network access if using an Atlas SRV connection.

### Admin is logged out after refresh

-   Inspect the current authentication persistence strategy.
-   Verify cookie settings or token restoration logic.
-   Check Axios `withCredentials` if using cookies.
-   Ensure the frontend waits for session restoration before
    redirecting.
-   Do not disable protected routes as a workaround.

### Email or OTP is not delivered

-   Verify provider credentials and sender verification.
-   Check provider logs and backend error responses.
-   Confirm production environment variables are configured.

### Image upload fails

-   Verify Cloudinary credentials and upload configuration.
-   Check file type and file-size validation.
-   Confirm the backend returns the expected media URL.

### Socket.IO notifications are not received

-   Confirm the client connects to the correct server origin.
-   Verify authenticated socket identity and Chef room membership.
-   Check CORS and deployment support for persistent connections.
-   Confirm the notification is persisted even if the Chef is offline.

## Contribution and Maintenance

-   Keep controllers focused on HTTP handling.
-   Keep reusable business logic in services.
-   Validate inputs at API boundaries.
-   Keep authorization checks on the backend.
-   Avoid duplicate business logic across routes.
-   Update this README when routes, scripts, environment variables, or
    business rules change.
-   Add tests for changes to payments, orders, subscriptions, rewards,
    and wallets.

## License

Add the project's actual license here before public distribution.
