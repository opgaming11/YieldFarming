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

;; Read-only functions
(define-read-only (get-farmer (farmer-id uint))
    (map-get? farmers {farmer-id: farmer-id}))

(define-read-only (get-yield-farmer (address principal))
    (map-get? yield-farmers {address: address}))

(define-read-only (get-pool (pool-id uint))
    (map-get? farming-pools {pool-id: pool-id}))

(define-read-only (calculate-rewards (address principal) (pool-id uint))
    (let ((farmer (get-yield-farmer address))
          (pool (get-pool pool-id))
          (current-height block-height))
        (match (unwrap! pool err-pool-not-found)
            pool-data
            (let ((stake-duration (- current-height
                                   (default-to u0 (get last-claim-height farmer))))
                  (stake-amount (default-to u0 (get staked-amount farmer))))
                (some (/ (* (* stake-amount (get apy pool-data)) stake-duration)
                        (* u365 u144)))))))


;; Public functions
(define-public (register-farmer (farmer-id uint)
                               (total-land uint)
                               (crop-type (string-utf8 24)))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-owner)
        (map-set farmers
            {farmer-id: farmer-id}
            {address: tx-sender,
             active: true,
             total-land: total-land,
             crop-type: crop-type,
             yield-estimate: u0})
        (ok true)))

(define-public (create-pool (pool-id uint)
                           (farmer-id uint)
                           (apy uint)
                           (min-stake uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-owner)
        (asserts! (>= min-stake min-stake-amount) err-insufficient-stake)
        (map-set farming-pools
            {pool-id: pool-id}
            {total-staked: u0,
             farmer-id: farmer-id,
             apy: apy,
             start-height: block-height,
             end-height: (+ block-height pool-duration),
             min-stake: min-stake,
             total-farmers: u0})
        (ok true)))

(define-public (stake-tokens (pool-id uint) (amount uint))
    (let ((pool (unwrap! (get-pool pool-id) err-pool-not-found))
          (current-height block-height))
        (begin
            (asserts! (>= amount (get min-stake pool)) err-insufficient-stake)
            (asserts! (< current-height (get end-height pool)) err-pool-expired)

            ;; Transfer tokens to contract
            (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

            ;; Update yield farmer data
            (map-set yield-farmers
                {address: tx-sender}
                {staked-amount: (+ amount
                    (default-to u0
                        (get staked-amount (get-yield-farmer tx-sender)))),
                 rewards: u0,
                 last-claim-height: current-height})

            ;; Update pool data
            (map-set farming-pools
                {pool-id: pool-id}
                (merge pool
                    {total-staked: (+ amount (get total-staked pool)),
                     total-farmers: (+ u1 (get total-farmers pool))}))
            (ok true))))

(define-public (claim-rewards (pool-id uint))
    (let ((pool (unwrap! (get-pool pool-id) err-pool-not-found))
          (farmer (unwrap! (get-yield-farmer tx-sender) err-not-active-farmer))
          (rewards (unwrap! (calculate-rewards tx-sender pool-id) (err u0))))
        (begin
            (try! (as-contract (stx-transfer? rewards (as-contract tx-sender) tx-sender)))
            (map-set yield-farmers
                {address: tx-sender}
                (merge farmer
                    {rewards: u0,
                     last-claim-height: block-height}))
            (ok rewards))))

(define-public (update-yield-estimate (farmer-id uint) (new-estimate uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-owner)
        (map-set farmers
            {farmer-id: farmer-id}
            (merge (unwrap! (get-farmer farmer-id) err-not-active-farmer)
                {yield-estimate: new-estimate}))
        (ok true)))

;; Emergency functions
(define-public (emergency-shutdown (pool-id uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-owner)
        (let ((pool (unwrap! (get-pool pool-id) err-pool-not-found)))
            (map-set farming-pools
                {pool-id: pool-id}
                (merge pool {end-height: block-height}))
            (ok true))))
