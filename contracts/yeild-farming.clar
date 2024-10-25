;; Sustainable Yield Farming Contract
;; Connects crypto yield farmers with real-world agricultural projects

;; Data Maps
(define-map farmers
    ((farmer-id uint))
    ((address principal)
     (active bool)
     (total-land uint)
     (crop-type (string-utf8 24))
     (yield-estimate uint)))

(define-map yield-farmers
    ((address principal))
    ((staked-amount uint)
     (rewards uint)
     (last-claim-height uint)))

(define-map farming-pools
    ((pool-id uint))
    ((total-staked uint)
     (farmer-id uint)
     (apy uint)
     (start-height uint)
     (end-height uint)
     (min-stake uint)
     (total-farmers uint)))

;; Constants
(define-constant contract-owner tx-sender)
(define-constant min-stake-amount u1000000) ;; Minimum 1M microSTX
(define-constant reward-cycle-length u144) ;; Approximately 1 day
(define-constant pool-duration u52560) ;; Approximately 365 days

;; Error constants
(define-constant err-not-owner (err u100))
(define-constant err-pool-not-found (err u101))
(define-constant err-insufficient-stake (err u102))
(define-constant err-pool-expired (err u103))
(define-constant err-not-active-farmer (err u104))
