# A Blockchain-Based Office Payroll Management System Using Token Streaming on Solana

**Submitted for the partial fulfillment of the BS Software Engineering / Computer Science degree to the Faculty of Engineering & Computer Science**

Group Members: [Student Name 1], [Student Name 2], [Student Name 3]

Supervised By: [Supervisor Name]

**NATIONAL UNIVERSITY OF MODERN LANGUAGES, ISLAMABAD**

June, 2026

---

## ABSTRACT

Paying salaries in cryptocurrency is still mostly a manual affair. Finance teams send lump-sum transfers from a wallet, keep a spreadsheet on the side, and hope nobody fat-fingers an address. This project, named Streamflow Office Payroll, was built to remove that friction by letting an organization pay its employees through continuous token streams on the Solana blockchain instead of one-off transfers. The work compares with existing tools such as Zebec Protocol, Superfluid and Request Finance, and borrows the streaming idea while adding the organizational controls those tools tend to leave out, namely role-based approvals, departmental budget caps and tamper-evident audit logging.

The system was developed as a single web application using Next.js 15 with the App Router, TypeScript, a PostgreSQL database accessed through Prisma, and the Streamflow SDK for the on-chain part. A non-custodial design was chosen, so payment transactions are signed by a connected Phantom wallet in the browser and the server only records what happened. Role-based access control sits in front of every protected route, and a background reconciliation worker polls Streamflow to keep the local stream records honest.

Testing was done at two levels. Unit tests written with Vitest cover the access-control guard, the budget rules, the encryption helpers and the Streamflow mock client, while Playwright drives the full payroll flow end to end. Most of the planned modules reached a working state on Solana devnet, including wallet linking, contract creation, the two-step approval chain and real stream creation that is verifiable on the Solana Explorer. The remaining limitations, mainly around pause/resume support and token decimals, are discussed honestly in the final chapter.

---

## TABLE OF CONTENTS (Summary)

Chapter 1: Introduction
Chapter 2: Background and Existing Work
Chapter 3: Requirements Specification
Chapter 4: System Modelling
Chapter 5: Implementation
Chapter 6: Result, Testing, Analysis and Validation
Chapter 7: Conclusion and Future Work
References

---

# CHAPTER 1: INTRODUCTION

## 1.1 Introduction

Streamflow Office Payroll is a web-based payroll system that pays employees in crypto tokens through continuous payment streams rather than discrete monthly transfers. The idea behind a stream is simple. Instead of receiving one payment at the end of the month, an employee earns their salary second by second, and the unlocked portion can be withdrawn at any time. The platform wraps this streaming primitive in the structure a real company needs, which is where most of our engineering effort went.

A finance administrator can register employees, draft pay contracts, route those contracts through an approval chain, and then create an on-chain stream that releases tokens over the contract period. Throughout that journey the system keeps a hashed audit trail, enforces departmental spending caps, and notifies the people who need to know. The blockchain piece runs on Solana, and the streaming itself is handled by Streamflow, a protocol that specializes in token vesting and payments.

## 1.2 Motivation

Web3 companies, DAOs and remote-first startups increasingly pay contributors in tokens, yet the tooling around that habit is thin. Treasuries are often a single multisig and a spreadsheet. When someone leaves mid-month, the company has usually overpaid, because the salary went out as a lump sum on the first of the month. Streaming fixes the overpayment problem by design, since a cancelled stream simply stops unlocking funds. That financial property is what first drew us to the topic.

The second motivation was governance. A payroll run touches real money, so it should not be a one-click action for a single person. We wanted to study how approval workflows, budgets and audit logging can be layered on top of an on-chain primitive without taking custody of anyone's keys. Building that combination turned out to be a meaningful software engineering challenge, which made it a good fit for a final year project. The work also maps to UN Sustainable Development Goal 8, decent work and economic growth, by making fair and transparent payment of remote workers easier.

## 1.3 Problem Statement

Organizations that pay salaries in cryptocurrency lack a controlled, auditable way to do it. Existing streaming protocols release funds on-chain but do not understand company roles, departmental budgets, or multi-person approvals, while traditional payroll software understands those things but cannot talk to a blockchain wallet. The gap leaves finance teams choosing between safety and the benefits of streaming. This project addresses that gap by combining on-chain token streaming with off-chain organizational controls in a single application.

## 1.4 Goals and Objectives

The headline goal was to deliver a working payroll application where a salary can travel from contract to a live on-chain stream under proper authorization. Supporting objectives shaped the work. We aimed to enforce permissions on every sensitive action through a role-based model, to keep an immutable record of who did what, and to stop payments that would breach a budget. A further objective was to stay non-custodial, meaning the server never holds employee or employer private keys. We also wanted the local database and the chain to agree over time, which led to the reconciliation worker described later.

## 1.5 Scope of the Study

The project covers the full payroll lifecycle inside one organization tenant: authentication, wallet linking, employee and contract management, approvals, stream creation, budgets, dashboards, audit logging and report generation. Solana devnet was the target network for demonstration, with the SOL token used as the primary asset. The scope deliberately excludes tax calculation, fiat on-ramps and off-ramps, and payroll for jurisdictions with statutory deductions, since those would each be a project on their own.

## 1.6 Process Model

We followed an incremental and iterative model that sat close to Agile in practice. The reasoning was practical rather than ideological. The Streamflow SDK and the Solana wallet behaviour were unfamiliar to us at the start, so building in small vertical slices and testing each one on devnet reduced the risk of discovering a blocking issue late. Each slice delivered a usable feature, for example wallet linking first, then contracts, then approvals, then streams. Biweekly supervisor meetings matched this rhythm well, since every meeting could review a working increment.

## 1.7 Nature of the Project

This is a full-stack web application with a blockchain integration. The front end and back end share one Next.js codebase, the database is relational, and a separate long-running worker process handles background reconciliation. The blockchain side is not a smart contract we wrote ourselves but an integration with the deployed Streamflow program, which we considered the more realistic and maintainable choice for a payroll use case.

## 1.8 Overview of the Report

The rest of the report is organized as defined by the department. Chapter 2 reviews the domain and compares existing systems. Chapter 3 records the requirements. Chapter 4 presents the architecture and design models. Chapter 5 explains how the modules were actually built, naming the libraries and APIs used. Chapter 6 reports testing and results, and Chapter 7 closes with conclusions, honest limitations and future work.

---

# CHAPTER 2: BACKGROUND AND EXISTING WORK

## 2.1 Introduction

Before any code was written we spent time understanding two worlds that rarely meet: conventional payroll administration and on-chain token streaming. This chapter explains the domain concepts that the rest of the report assumes, then looks at three real systems that solve part of the problem, and finishes with an honest comparison that shows where our project sits.

## 2.2 Explanation of Important Constructs of the Application Domain

### 2.2.1 Token Streaming

A token stream is an on-chain agreement that releases a fixed amount of a token to a recipient continuously over a time window. The core parameters are a start time, an end time, an optional cliff, and a per-period amount. At any moment the recipient can withdraw whatever has unlocked so far. Streamflow implements this as a program on Solana, and the Streamflow SDK exposes operations such as create, withdraw, top-up, transfer and cancel [1]. The financial appeal is that money is only ever committed for time that has actually elapsed, so a cancellation returns the unvested remainder to the sender.

### 2.2.2 The Solana Account and Transaction Model

Solana is a high-throughput proof-of-stake blockchain where state lives in accounts and programs operate on those accounts [2]. A user holds a keypair, and any state-changing action is a transaction signed by that keypair. Because the signature must come from the key holder, a payroll application cannot move someone's funds without their signature, which is exactly the non-custodial property we wanted. Our application talks to Solana through the @solana/web3.js library and reads balances directly from a cluster RPC endpoint.

### 2.2.3 Wallets and Non-Custodial Signing

A wallet such as Phantom holds the user's private key and exposes a signing interface to web pages. When the finance administrator creates a stream, the unsigned transaction is built in the browser and handed to Phantom, which asks the human to approve it. The signed transaction then goes to the network. Our server never sees the private key, and that single decision shaped much of the architecture in Chapter 4.

### 2.2.4 Organizational Controls

Payroll is not only a money-movement problem, it is a governance problem. The domain here brings in role-based access control, where each user holds roles that grant permissions, and approval workflows, where a sensitive action waits for sign-off before it can proceed. Budgets cap how much a department may commit, and audit logs record every action for later inspection. These constructs are familiar from enterprise software, and porting them onto a blockchain payment rail is the heart of our contribution.

## 2.3 Existing Studies and Systems

Three systems were studied in detail because each overlaps with our problem.

Zebec Protocol is a Solana-native streaming payments platform that markets itself for payroll and treasury use [3]. It pioneered continuous salary streaming on Solana and offers a polished employee experience. Its focus, though, is the streaming primitive and a consumer-style dashboard, with limited support for multi-step internal approvals or per-department budget enforcement of the kind a finance team layers on top.

Superfluid is a money-streaming protocol on Ethereum and several EVM chains [4]. Its "Super Tokens" let value flow per second between addresses, and it has a strong developer ecosystem. Superfluid is powerful as infrastructure, but it lives on EVM chains where transaction fees are higher than Solana, and like Zebec it is a protocol rather than an opinionated payroll product with roles and audit trails.

Request Finance, together with similar crypto-payroll services such as Bitwage, takes the opposite stance [5]. These are business-facing products with invoicing, approvals and accounting exports, and they handle crypto and fiat. What they generally do not offer is true per-second streaming with on-chain cancellation, because they settle as scheduled batch transfers rather than as a live stream that the recipient can draw down continuously.

## 2.4 Comparison of Existing Systems

Table 2.1 sets the three systems against the project on the features that mattered to us during requirements gathering. The comparison is drawn from each platform's public documentation and our own hands-on testing of the streaming concept on devnet.

Table 2.1: Comparison of existing systems with the proposed project

| Feature                        | Zebec   | Superfluid | Request Finance | Streamflow Office Payroll (ours) |
| ------------------------------ | ------- | ---------- | --------------- | -------------------------------- |
| Per-second token streaming     | Yes     | Yes        | No              | Yes (via Streamflow)             |
| Chain                          | Solana  | EVM chains | Multi-chain     | Solana                           |
| Non-custodial signing          | Yes     | Yes        | Partial         | Yes (Phantom in browser)         |
| Multi-step internal approvals  | Limited | No         | Yes             | Yes (contract + funding)         |
| Department budget caps         | No      | No         | Partial         | Yes                              |
| Tamper-evident audit log       | No      | No         | Partial         | Yes (SHA-256 hashed)             |
| Role-based access control      | Basic   | No         | Yes             | Yes (six roles)                  |
| Built-in reconciliation worker | N/A     | N/A        | N/A             | Yes                              |

The pattern is clear enough. Streaming protocols are strong on the on-chain mechanism and weak on internal governance, while business payroll products are strong on governance and weak on streaming. Our project tries to occupy the middle ground by using Streamflow for the on-chain mechanism and building the governance layer ourselves.

## 2.5 Summary

The domain combines an on-chain streaming primitive with off-chain company controls. Existing systems handle one side well and the other side poorly. That observation became the design brief for the rest of the project: reuse a mature streaming protocol, and invest our own effort in roles, approvals, budgets and auditing so that streaming becomes safe for an organization to actually use.

---

# CHAPTER 3: REQUIREMENTS SPECIFICATION

## 3.1 Introduction

Requirements were gathered iteratively. We started from the payroll narrative described earlier, broke it into the actions different roles would take, and refined the list across supervisor meetings. This chapter records the interface, functional and non-functional requirements, presents the use case model, walks through a few representative use cases, and notes the resource, database and feasibility considerations.

## 3.2 Interface Requirements

Because the system spans a browser, a server and a blockchain, the interfaces split naturally into hardware-adjacent and software categories.

### 3.2.1 Hardware Interface Requirements

The application has no custom hardware. It does depend on the user's machine running a modern browser with the Phantom wallet extension installed, since wallet signing happens there. On the server side a host capable of running Node.js 20 and reaching a Solana RPC endpoint over the network is sufficient. No specialized or high-end machine is required, which keeps deployment cheap.

### 3.2.2 Software Interface Requirements

The system integrates with several external software interfaces. It talks to Solana through a cluster RPC URL using @solana/web3.js, and to the Streamflow program through the @streamflow/stream SDK. User identity can come through Google OAuth 2.0, exchanging an authorization code at Google's token endpoint and reading the profile from the user-info endpoint. Persistence happens through Prisma against a PostgreSQL database hosted on Neon. The browser also speaks to the Phantom wallet provider that the page injects. Each of these is a contract the system must respect, and a change in any of them, for instance a Streamflow SDK version bump, ripples into our code.

## 3.3 Functional Requirements

The functional requirements were derived module by module. Table 3.1 lists the ones that drove development, written so each is verifiable.

Table 3.1: Functional requirements of the system

| ID    | Requirement                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | A user shall sign in by email in demo mode or through Google OAuth, and receive a signed session.                           |
| FR-2  | A user with the right permission shall link a Solana wallet, mark one as primary, and view its live balance.                |
| FR-3  | An HR or admin user shall create, update and list employees with a status of active, inactive, terminated or on leave.      |
| FR-4  | An authorized user shall create a pay contract specifying token, rate type, amount per period and period.                   |
| FR-5  | A contract shall pass through an approval step before it can be funded.                                                     |
| FR-6  | A funding approval shall be recorded before a stream can be created.                                                        |
| FR-7  | A finance administrator shall create an on-chain stream for an approved, funded contract, signed by their connected wallet. |
| FR-8  | The system shall reject a stream whose total amount would exceed the department budget cap.                                 |
| FR-9  | A recipient shall withdraw unlocked funds, and an authorized user shall cancel a stream.                                    |
| FR-10 | Every sensitive action shall write an audit log entry with a content hash.                                                  |
| FR-11 | A background worker shall reconcile local stream status against Streamflow and raise anomalies.                             |
| FR-12 | A finance user shall view dashboard metrics covering active streams, monthly payout and burn rate.                          |
| FR-13 | An authorized user shall generate a monthly audit report as a PDF.                                                          |

## 3.4 Use Case Model

The use case model groups actors by role. The six roles are system administrator, finance administrator, manager, HR, employee and auditor. Figure 3.1 shows the use case diagram. The finance administrator drives most of the money-related cases, the manager acts as an approver, HR manages people, the employee views and withdraws from their own streams, and the auditor has read access to logs and reports.

_Figure 3.1: Use case diagram of Streamflow Office Payroll (actors mapped to payroll, approval, stream and audit use cases)._

## 3.5 Use Cases

Two use cases are described here because they carry the most business logic. The full set follows the same template.

Table 3.2: Use case UC-1, Create Stream

| Field          | Description                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use case       | Create Stream                                                                                                                                                                          |
| Primary actor  | Finance Administrator                                                                                                                                                                  |
| Precondition   | Contract is approved, funding is approved, and the employee has a primary wallet.                                                                                                      |
| Main flow      | The actor selects an approved contract, the browser builds the stream transaction, Phantom signs it, the stream is created on Streamflow, and the result is stored with status ACTIVE. |
| Postcondition  | A stream record exists with a Streamflow stream id and an on-chain transaction signature.                                                                                              |
| Alternate flow | If the total amount exceeds the department budget cap, the request is rejected with a budget violation.                                                                                |

Table 3.3: Use case UC-2, Approve Contract

| Field          | Description                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use case       | Approve Contract                                                                                                                                                                                |
| Primary actor  | Manager                                                                                                                                                                                         |
| Precondition   | A pending approval exists for the contract and the actor holds the approve-payroll permission.                                                                                                  |
| Main flow      | The actor opens the approvals page, reviews the pending item, and approves it. The approval status changes to APPROVED, the approver and timestamp are recorded, and an audit entry is written. |
| Postcondition  | The contract becomes eligible for funding approval and, later, stream creation.                                                                                                                 |
| Alternate flow | An already-decided approval cannot be approved again and returns an error.                                                                                                                      |

## 3.6 Non-Functional Requirements

Quality attributes mattered as much as features, given that the system moves money. Table 3.4 records them.

Table 3.4: Non-functional requirements of the system

| ID    | Category    | Requirement                                                                                               |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------- |
| NFR-1 | Security    | Sessions shall use signed JWTs in HttpOnly cookies, and state-changing requests shall carry a CSRF token. |
| NFR-2 | Security    | Sensitive values stored at rest shall be encrypted with AES-256-GCM.                                      |
| NFR-3 | Security    | Authentication endpoints shall be rate limited to slow brute-force attempts.                              |
| NFR-4 | Reliability | Local stream status shall converge with the chain within one reconciliation cycle.                        |
| NFR-5 | Integrity   | Audit log entries shall include a SHA-256 hash so tampering is detectable.                                |
| NFR-6 | Performance | Dashboard metrics shall load from indexed database queries without scanning the chain on each request.    |
| NFR-7 | Consistency | Budget checks shall use exact decimal arithmetic, not floating point, to avoid rounding drift.            |

### 3.6.1 Performance

Read-heavy screens such as the finance dashboard are served from PostgreSQL using indexed queries on the streams and budgets tables, rather than querying the blockchain on every page load. On-chain reads are deferred to the background worker. This keeps the interactive paths fast and predictable.

### 3.6.2 Reliability

Because Streamflow does not push webhooks, the reconciliation worker polls each active and paused stream on a fixed interval and writes back the latest status. A status mismatch is logged as an anomaly rather than a silent divergence, which protects the reliability of what the finance team sees.

### 3.6.3 Security

Security was treated as a first-class requirement. Access control is checked on every protected route, sessions are short-lived with a separate refresh token, CSRF is enforced with a double-submit cookie, and at-rest secrets use authenticated encryption. The OWASP Top Ten guided these choices [6].

### 3.6.4 Consistency

Token amounts use a decimal type in the database and decimal arithmetic in the budget logic, so committed totals add up exactly. Mixing floating point into currency maths was avoided on purpose.

## 3.7 Resource Requirements

The equipment was modest. Development used standard laptops, a free Neon PostgreSQL instance, and Solana devnet, where SOL is obtained from a faucet at no cost. The software stack is open source: Next.js, TypeScript, Prisma, Tailwind CSS, the Streamflow SDK and the testing tools. Human effort was divided across three members, with roughly one member focused on the blockchain and wallet integration, one on the data model and back-end services, and one on the front end and testing, over an effort of about twelve man-months combined.

## 3.8 Database Requirements

The data model needed to be multi-tenant, since every record belongs to an organization. It also had to capture the payroll lifecycle as related entities: organizations, users, wallets, roles, permissions, employees, contracts, approvals, streams, budgets, departments, audit logs and audit reports. Money columns required a wide decimal type, and several columns needed indexing for the dashboard queries. The full schema is presented in Chapter 4.

## 3.9 Project Feasibility

### 3.9.1 Technical Feasibility

The project is technically feasible. Every external dependency we rely on is mature and documented, and none of them demanded expensive infrastructure. The riskiest part, on-chain stream creation, was proven early on devnet, which retired most of the technical doubt.

### 3.9.2 Operational Feasibility

Operationally the system fits how a finance team already works. The approval chain mirrors a real sign-off process, and the dashboard answers the questions a finance manager actually asks. The non-custodial model also lowers the operational burden of key management.

### 3.9.3 Legal and Ethical Feasibility

The application does not take custody of funds, store private keys, or break any platform rules. It records data only within an organization tenant, encrypts sensitive values, and keeps an audit trail, which supports accountability. These properties make it legally and ethically sound for the intended use.

## 3.10 Summary

The requirements describe a multi-tenant payroll application that is secure, auditable and budget-aware, built on top of a non-custodial streaming rail. The functional list defines what it does, the non-functional list defines how well, and the feasibility analysis confirms the project was achievable within the available time and resources.

---

# CHAPTER 4: SYSTEM MODELLING

## 4.1 Introduction

This chapter explains how the system is put together. It records the architectural decisions we made, the reasons behind them, and the design models that describe the structure and behaviour. The aim is to show that the implementation in Chapter 5 follows a deliberate design rather than an accidental one.

## 4.2 System Design

The application is a single Next.js codebase that serves both the user interface and the back-end API, backed by PostgreSQL through Prisma, with a separate worker process for reconciliation. Three decisions defined the design. First, the system is non-custodial, so all signing happens in the browser through Phantom and the server only persists results. Second, the back end is organized as service modules behind API route handlers, each handler wrapped by an access-control guard. Third, external integrations are hidden behind interfaces with swappable implementations, so a mock can stand in for the real Streamflow SDK during development.

That third decision is visible in the Streamflow client. A factory function, createStreamflowClient, returns either the real StreamflowClient or a MockStreamflowClient depending on the STREAMFLOW_ENABLED flag. The same idea applies to wallets, where a registry holds adapters for Phantom, Solflare, a MetaMask Solana Snap and a development mock, all behind a common ConnectedWallet interface. The benefit was concrete: we could build and test the entire payroll flow without spending devnet SOL on every run.

## 4.3 Design Approach

We adopted a top-down design approach. Work began from the overall payroll narrative and the role model, which were decomposed into modules, then into services and finally into individual functions. Starting from the whole rather than the parts kept the modules aligned to business actions, so for example the stream creation endpoint reads almost like the use case it implements: check the contract, check the approvals, check the budget, create the stream, log the action.

## 4.4 Interface Design

### 4.4.1 High-Fidelity Prototype

The interface is built with Tailwind CSS and a set of React components, with charts drawn using Recharts on the finance dashboard. Navigation groups the screens by purpose: employees and contracts for HR, approvals for managers, streams and the finance dashboard for finance, and a personal streams view for employees. Figure 4.1 shows the finance dashboard mockup, which surfaces active streams, monthly payout, paused streams, upcoming starts, burn rate and the budget cap. Figure 4.2 shows the stream creation screen where the finance administrator selects an approved contract and signs the transaction in Phantom.

_Figure 4.1: High-fidelity prototype of the finance dashboard showing live payroll metrics and the thirty-day burn-rate chart._

_Figure 4.2: High-fidelity prototype of the stream creation screen with the Phantom signing step._

## 4.5 4+1 View Model of Architecture

The architecture is described using the 4+1 view model, since each view answers a different stakeholder question.

### 4.5.1 Logical View

The logical view captures the main classes and services. Figure 4.3 shows the class diagram. The RBAC service exposes getUserPermissions, hasPermission and assertPermission, and is composed into the withAuthAndRBAC guard that wraps route handlers. The Streamflow client interface is realized by both the real and mock clients. The budget service exposes computeCommitted and canCommit. The session service exposes issueSessionTokens and getSession. These services are loosely coupled and talk to the database through a single Prisma client.

_Figure 4.3: Logical view, class diagram of the core services and their relationships._

### 4.5.2 Process View

The process view describes runtime behaviour. Figure 4.4 shows the sequence for creating a stream. The finance administrator triggers creation, the browser builds and signs the transaction with Phantom, Streamflow creates the stream on Solana, and the server validates approvals and budget before storing the record and writing an audit entry. Figure 4.5 shows the reconciliation activity: the worker wakes on its interval, loads active and paused streams, calls getOne on each through the Streamflow client, compares statuses, updates the row and logs an anomaly when they differ.

_Figure 4.4: Process view, sequence diagram for the Create Stream use case._

_Figure 4.5: Process view, activity diagram for the reconciliation worker._

### 4.5.3 Development View

The development view shows how the code is partitioned into modules: an authentication and session module, an RBAC and middleware module, wallet adapters, the Streamflow integration, finance and budget services, the audit and reporting module, and the reconciliation worker. Figure 4.6 presents the component diagram. The browser components depend on the API route handlers, the handlers depend on the service modules, and the services depend on Prisma and the external SDKs.

_Figure 4.6: Development view, component diagram of the application modules._

### 4.5.4 Physical View

The physical view describes deployment. The Next.js application runs as one process and the reconciliation worker as a second, both connecting to the managed PostgreSQL database and to a Solana RPC endpoint. Figure 4.7 shows the deployment diagram, including the browser with Phantom, the application server, the worker, the database and the Solana cluster. Health endpoints expose the liveness of the app and the worker.

_Figure 4.7: Physical view, deployment diagram of the running system._

## 4.6 Entity Relationship Diagram

The data model is relational and multi-tenant. Every primary entity carries an organization reference, which scopes queries to a single tenant. Figure 4.8 shows the entity relationship diagram. An organization owns users, employees, contracts, streams, budgets, departments, approvals, audit logs and audit reports. An employee belongs to an organization and links to a user account (created or matched by email during onboarding), and holds many contracts. A contract belongs to an employee and produces streams. A stream references its contract, its employee and its organization, and stores the Streamflow stream id and the on-chain transaction signature. Budgets connect to departments through a join table, and roles connect to permissions through a role-permission join table. Money columns use a decimal type with twenty digits of precision and eight decimal places, which comfortably holds token amounts.

_Figure 4.8: Entity relationship diagram of the database (organizations, employees, contracts, approvals, streams, budgets, departments, audit logs and related tables)._

## 4.7 Summary

The design is a non-custodial web application with swappable external integrations, a service-oriented back end guarded by role-based access control, and a relational multi-tenant data model. The 4+1 views show the same system from the angles that matter, and the entity relationship diagram grounds the behaviour in concrete tables. Chapter 5 now shows how these decisions turned into code.

---

# CHAPTER 5: IMPLEMENTATION

## 5.1 Introduction

This chapter describes how each module was built and names the libraries, frameworks, database features and APIs used. The system runs on Next.js 15 with the App Router and React 19, written in TypeScript throughout. Data access uses Prisma against PostgreSQL, input validation uses Zod, server state on the client uses TanStack Query, and lightweight client state uses Zustand. The sections below follow the payroll lifecycle, since that is how a reviewer would walk the system.

## 5.2 Modules of the FYP

### 5.2.1 Authentication and Session Management

Authentication supports a demo email sign-in and Google OAuth 2.0. The OAuth callback exchanges the authorization code at Google's token endpoint, reads the profile from the user-info endpoint, finds or creates the matching user, and then issues a session. Sessions are JWTs signed with the jose library using HS256. The issueSessionTokens function mints a short-lived session token valid for twenty-four hours and a refresh token valid for seven days, both stored as HttpOnly cookies, and getSession verifies the session token on each request. A refresh path re-mints the session token from a valid refresh token. A new user signing in is attached to their existing organization and role, or to the default organization with the EMPLOYEE role.

### 5.2.2 Role-Based Access Control

Access control is the spine of the back end. The data model stores roles, permissions and a role-permission join, and the six seeded roles are system administrator, finance administrator, manager, HR, employee and auditor. Permissions are fine-grained keys such as CREATE_STREAM, APPROVE_PAYROLL, MANAGE_EMPLOYEES, VIEW_FINANCE_DASHBOARD and VIEW_AUDIT. The RBAC module exposes getUserPermissions, which collects the permission keys a user holds in an organization, along with hasPermission, hasAnyPermission and assertPermission. Routes are protected by a higher-order function, withAuthAndRBAC, that authenticates the request, confirms the organization exists, checks the required permissions with either OR or AND logic, and only then calls the handler. A denied check throws a PermissionDeniedError, which the guard turns into a 403 response, and the denial is also written to the audit log so refused attempts leave a trace.

### 5.2.3 Wallet Linking and Balances

Wallet support uses a registry pattern. A WalletRegistry holds adapters that each implement a common interface, and the primary adapter wraps Phantom, with a Solflare placeholder, a MetaMask Solana Snap adapter and a development mock also registered. Linking a wallet stores its address, provider and network against the user and organization, and one wallet per user can be marked primary. Balances are read live from a Solana RPC endpoint through @solana/web3.js rather than cached, so the figure shown is always current, and on devnet a faucet endpoint helps testers fund a wallet.

### 5.2.4 Employee and Contract Management

Employee records hold a display name, a status from the employee status enum, and start and end dates, and they optionally link to a user account so a person can later sign in and view their own streams. Contracts capture the token mint and symbol, a rate type of salary, hourly or milestone, the amount per period stored as a decimal, and a period of monthly, weekly, biweekly or one-time. Each create and update is validated with a Zod schema before it reaches the database, and Prisma writes the row. The contract also has a place to store an on-chain transaction signature for cases where contract acceptance itself is recorded on-chain.

### 5.2.5 Approvals Workflow

The approval module implements a generic, multi-step workflow. An approval row records a subject type such as CONTRACT or STREAM, the subject id, a step number and a status from pending, approved, rejected or cancelled. A request endpoint creates the pending approval, and the approve endpoint, guarded by the approve-payroll permission, flips the status to approved while recording the approver and the timestamp. Stream creation later checks for an approved contract approval and an approved funding approval before it will proceed, which is how the two-stage sign-off is enforced in practice.

### 5.2.6 Stream Creation and Streamflow Integration

Stream creation is the most involved module. The endpoint, guarded by the CREATE_STREAM permission, first loads the contract and confirms it is active and belongs to the organization. It then verifies both the contract approval and the funding approval, computes the total amount from the per-period amount and the contract duration, and resolves the employee's primary wallet as the recipient. If the employee belongs to a department, the budget check runs at this point. Because the design is non-custodial, the real signing happens in the browser: the client uses the Streamflow SDK with the Phantom adapter to build and submit the transaction, and then posts the resulting Streamflow stream id and on-chain transaction signature back to the server, which stores the stream with status ACTIVE and a synced timestamp. The server-side Streamflow client itself wraps the SDK's GenericStreamClient and maps its create, withdraw, topup, transfer and cancel operations, converting amounts with the SDK's big-number helpers and selecting the cluster from configuration. A mock client mirrors the same interface for development, simulating accrual over time so the dashboard and reconciliation logic can be exercised without the chain. Every successful creation writes an audit entry that includes a SHA-256 hash of the stream configuration, and a notification is sent to the recipient.

### 5.2.7 Budget Enforcement

Budgets stop the system from over-committing. The budget service computes the currently committed amount for a token by summing the total amounts of active and paused streams, with computeCommitted at the organization level and computeDepartmentCommitted at the department level. The canCommit function adds the proposed amount to the current commitment and compares it against the sum of the relevant budget caps, returning a structured result that says whether the commit is allowed and, if not, why. All of this arithmetic uses the Prisma decimal type rather than JavaScript numbers, so large token amounts add up without rounding error. The stream creation endpoint calls canCommit and refuses the request with a clear budget-violation message when the cap would be breached.

### 5.2.8 Audit Logging and Integrity

Audit logging runs through a shared helper that records the acting user, the action, the entity and its id, the before and after states as JSON, and the request's IP and user agent. Each entry also stores a SHA-256 hash computed over its contents, so a later tampering attempt becomes detectable. The same hashing approach secures permission-denial records. Audit data can be exported as CSV, and a reporting module uses pdfmake to render a monthly report whose file is itself hashed and recorded in an audit-report row, giving a verifiable artifact for compliance.

### 5.2.9 Reconciliation Worker

Streamflow does not provide webhooks, so a background worker keeps the local records aligned with the chain. The worker runs on a fixed interval, loads all active and paused streams, and for each one calls getOne through the Streamflow client. It compares the remote status with the stored status, updates the row and its synced timestamp, and when it detects a divergence such as a remote cancellation or completion it logs the anomaly. A small health server exposes the worker's liveness so a deployment can monitor it. The worker can run alongside the web app during development with a single combined command.

### 5.2.10 Finance Dashboard

The dashboard endpoint, guarded by the finance-dashboard permission, computes its metrics from the database. It counts active and paused streams, estimates the monthly payout by normalizing each contract's period to a monthly figure, counts upcoming starts within the next month, and derives a burn rate and total cap from the budgets. It also produces a thirty-day burn-rate series for the chart. All of these come from indexed queries rather than chain reads, which keeps the page responsive.

### 5.2.11 Input Validation, Error Handling and Security Middleware

Validation and error handling were applied consistently rather than route by route. Every endpoint that accepts a body parses it through a Zod schema at the top of the handler, so a malformed request is rejected with a clear validation error before any business logic runs, and the inferred TypeScript type then flows through the rest of the function. Errors are caught and translated into friendly messages with the correct status code, while the raw error is logged with context for debugging, so a user never sees a stack trace. Several cross-cutting protections sit in the middleware layer. CSRF uses a double-submit cookie, where a token is placed in a readable cookie and must be echoed in a request header on any state-changing call. Rate limiting wraps the authentication endpoints, allowing only a handful of attempts per window, with an in-memory store in development and an Upstash Redis store in production. Sensitive values that must be stored at rest are protected by AES-256-GCM through the encrypt and decrypt helpers, which keep the initialization vector and authentication tag alongside the ciphertext so tampering is caught on decryption. A SHA-256 hash helper backs both the audit log integrity and the report verification described earlier.

## 5.3 Hardware Module Details

The project has no custom hardware. The only hardware dependency is the user's machine running the Phantom browser extension for signing, which the software interfaces with through the injected wallet provider rather than any device driver of our own.

## 5.4 Summary

Each module was built on a mature library chosen for the job: Next.js and React for the application, Prisma and PostgreSQL for data, jose for sessions, Zod for validation, the Streamflow SDK and @solana/web3.js for the chain, pdfmake for reports, and Recharts for the dashboard. The non-custodial pattern threads through the whole implementation, the access-control guard sits in front of every sensitive route, and the reconciliation worker quietly keeps the database honest. Chapter 6 now reports how well it all held up under testing.

---

# CHAPTER 6: RESULT, TESTING, ANALYSIS AND VALIDATION

## 6.1 Introduction

Testing was treated as part of building, not an afterthought. We used two layers: unit tests with Vitest for the logic-heavy modules, and end-to-end tests with Playwright for the user journeys. On top of automated tests, we ran the full flow manually on Solana devnet with a real Phantom wallet, because nothing validates a non-custodial design quite like signing a real transaction and finding it on the explorer. This chapter describes the setup, the cases we ran, and an honest reading of the results.

## 6.2 Testing Setup and Results

### 6.2.1 Test Environment

Unit tests run in isolation with Vitest, mocking the database and external SDKs so the logic under test is exercised directly. End-to-end tests run with Playwright against a development server, which Playwright starts automatically when needed. Manual on-chain testing used Solana devnet with SOL drawn from a public faucet, the Streamflow integration switched on, and Phantom set to the devnet network. A continuous integration workflow runs linting, type checking and the unit tests on every push.

### 6.2.2 Unit Testing

The unit suite focuses on the parts where a bug would be expensive. The access-control guard, the budget rules, the encryption helpers, the environment validation and the Streamflow mock client all carry tests. Table 6.1 lists representative unit cases and their outcomes.

Table 6.1: Representative unit test cases and results

| ID   | Test case                                                          | Expected result                  | Outcome |
| ---- | ------------------------------------------------------------------ | -------------------------------- | ------- |
| UT-1 | Guard allows a request when the user holds the required permission | Handler runs, response succeeds  | Pass    |
| UT-2 | Guard denies a request when the permission is missing              | 403 with permission-denied error | Pass    |
| UT-3 | Guard requires all permissions when requireAll is set              | Each permission is asserted      | Pass    |
| UT-4 | Guard rejects an unauthenticated request                           | 401 unauthorized                 | Pass    |
| UT-5 | canCommit allows an amount within the budget cap                   | canCommit is true                | Pass    |
| UT-6 | canCommit blocks an amount that exceeds the cap                    | canCommit is false with a reason | Pass    |
| UT-7 | encrypt then decrypt returns the original text                     | Round-trip matches input         | Pass    |
| UT-8 | decrypt fails on a tampered ciphertext                             | Throws a decryption error        | Pass    |

### 6.2.3 End-to-End Testing

The end-to-end suite drives the browser through the journeys a user actually takes. The main payroll test signs in, creates an employee, creates a contract, requests and grants an approval, and then checks that the finance dashboard reflects the change. Separate specs cover the authentication flow, wallet linking with the mock provider, and dashboard metrics. Table 6.2 records the end-to-end cases.

Table 6.2: End-to-end test cases and results

| ID    | Scenario                                             | Expected result                      | Outcome |
| ----- | ---------------------------------------------------- | ------------------------------------ | ------- |
| E2E-1 | Sign in and reach an authenticated page              | User is redirected away from sign-in | Pass    |
| E2E-2 | Link a wallet using the mock provider                | Wallet address is shown as linked    | Pass    |
| E2E-3 | Create employee, contract and approval, then approve | Each step shows a success state      | Pass    |
| E2E-4 | Dashboard shows active streams and monthly payout    | Metrics are visible and non-empty    | Pass    |

### 6.2.4 On-Chain Validation on Devnet

The most important validation was running the real flow on devnet. Table 6.3 records the manual cases that exercised the blockchain path. The headline result is that stream creation produced a genuine Streamflow stream whose transaction was visible on the Solana Explorer, which confirmed that the non-custodial signing path worked end to end.

Table 6.3: On-chain (devnet) validation cases and results

| ID   | Scenario                                            | Expected result                          | Outcome          |
| ---- | --------------------------------------------------- | ---------------------------------------- | ---------------- |
| OC-1 | Connect Phantom on devnet and read the live balance | Address and SOL balance are shown        | Pass             |
| OC-2 | Create a stream for an approved, funded contract    | Stream created, explorer link resolves   | Pass             |
| OC-3 | Create a stream that breaches the department budget | Request rejected with a budget violation | Pass             |
| OC-4 | Reconciliation detects a remotely cancelled stream  | Status updated and anomaly logged        | Pass             |
| OC-5 | Withdraw unlocked funds from an active stream       | Withdrawal transaction succeeds          | Partial          |
| OC-6 | Pause an active stream from the application         | Operation reported as unsupported        | Fail (by design) |

## 6.3 Analysis

The numbers behind the tables are encouraging without being perfect. The unit and end-to-end suites passed consistently, and the core devnet cases for connecting, creating and reconciling streams behaved as designed. Two results deserve a straight explanation rather than a gloss. The withdrawal case is marked partial because it works when the recipient's wallet is connected and the token decimals match the assumed value, but our client currently defaults to nine decimals, so a non-SOL token with different decimals would compute the wrong amount. The pause case is a deliberate failure: the Streamflow SDK does not support pausing a stream, so our client reports the operation as unsupported and the intended behaviour is to cancel instead. Recording it as a failure is more honest than hiding a feature we could not deliver.

Looking across the cases, the access-control and budget logic proved the most reliable, which is reassuring because those are the controls that protect money. The blockchain path was reliable for creation and reading but thinner around the edge operations. The reconciliation worker did what it was meant to, catching a status change that the application would otherwise have missed, although its fixed polling interval means there is always a window where the local view can lag the chain. None of these results claim a hundred percent success, and in a system that touches real funds that honesty is the point.

## 6.4 Summary

Testing combined automated unit and end-to-end coverage with manual on-chain validation on devnet. The protective logic, access control and budgets, passed cleanly, the main payroll journey worked end to end, and real streams were created and verified on the explorer. The known gaps are withdrawal handling for non-default token decimals and the absence of native pause support, both of which are carried forward into the next chapter.

---

# CHAPTER 7: CONCLUSION AND FUTURE WORK

## 7.1 Introduction

This chapter reviews the project against the objectives set in Chapter 1, states what was achieved, and is specific about what was not.

## 7.2 Conclusion and Future Work

The project set out to combine on-chain token streaming with the organizational controls a real finance team needs, and that goal was largely met. A salary can travel from an employee record, through a contract and a two-stage approval, to a live Streamflow stream signed by a connected Phantom wallet, with the result verifiable on the Solana Explorer. Access control guards every sensitive route, budgets block over-commitment using exact decimal arithmetic, the audit log hashes its entries, and a reconciliation worker keeps the database aligned with the chain. The non-custodial objective held throughout, since the server never handles a private key.

The honest limitations are these. Withdrawal assumes nine token decimals, so support for arbitrary tokens is incomplete. Pausing is not available because the underlying SDK does not offer it, and cancellation is the only stop mechanism. Reconciliation polls on an interval rather than reacting instantly, since Streamflow exposes no webhooks, so a short lag between chain and database is unavoidable. The system was demonstrated on devnet and has not been hardened for mainnet funds.

Future work follows directly from those gaps. Reading each token's decimals from its mint would make withdrawals correct for any asset. Batch stream creation, already stubbed in the client, would let a whole department be paid in one action. A signed integrity chain across audit entries would strengthen tamper evidence beyond per-row hashes, and a mainnet readiness pass covering key handling, monitoring and load would be required before real payroll could run. These are concrete next steps rather than a vague hope of improvement.

## 7.3 Summary

The work delivers a non-custodial, governed payroll system that streams crypto salaries on Solana and surrounds that streaming with roles, approvals, budgets and auditing. It meets its main objectives, names its shortcomings plainly, and leaves a clear path for the work that would take it from a devnet demonstration to a production payroll tool.

---

## REFERENCES

[1] Streamflow Finance, "Streamflow Protocol Documentation," Streamflow, 2024. [Online]. Available: https://docs.streamflow.finance

[2] A. Yakovenko, "Solana: A new architecture for a high performance blockchain," Solana Labs, Whitepaper, 2018. [Online]. Available: https://solana.com/solana-whitepaper.pdf

[3] Zebec Protocol, "Zebec: Continuous Settlement Protocol Documentation," Zebec, 2024. [Online]. Available: https://docs.zebec.io

[4] Superfluid Finance, "Superfluid Protocol Documentation," Superfluid, 2024. [Online]. Available: https://docs.superfluid.finance

[5] Request Finance, "Crypto Payroll and Invoicing Documentation," Request, 2024. [Online]. Available: https://request.finance

[6] OWASP Foundation, "OWASP Top Ten Web Application Security Risks," OWASP, 2021. [Online]. Available: https://owasp.org/Top10

[7] Vercel, "Next.js Documentation, App Router," Vercel, 2024. [Online]. Available: https://nextjs.org/docs

[8] Prisma Data Inc., "Prisma ORM Documentation," Prisma, 2024. [Online]. Available: https://www.prisma.io/docs

[9] The PostgreSQL Global Development Group, "PostgreSQL 16 Documentation," 2023. [Online]. Available: https://www.postgresql.org/docs

[10] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," RFC 7519, Internet Engineering Task Force, May 2015. [Online]. Available: https://datatracker.ietf.org/doc/html/rfc7519

[11] M. Dworkin, "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC," NIST Special Publication 800-38D, National Institute of Standards and Technology, Nov. 2007.
