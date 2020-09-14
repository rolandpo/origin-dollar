import React, { useState, useEffect } from 'react'
import { fbt } from 'fbt-runtime'
import { useStoreState } from 'pullstate'
import ethers from 'ethers'

import { formatCurrency } from 'utils/math.js'
import CoinWithdrawBox from 'components/buySell/CoinWithdrawBox'
import ContractStore from 'stores/ContractStore'
import AccountStore from 'stores/AccountStore'
import TimelockedButton from 'components/TimelockedButton'
import DisclaimerTooltip from 'components/buySell/DisclaimerTooltip'

import mixpanel from 'utils/mixpanel'

const SellWidget = ({
  ousdToSell,
  setOusdToSell,
  displayedOusdToSell,
  setDisplayedOusdToSell,
  sellFormErrors,
  setSellFormErrors,
  sellAllActive,
  setSellAllActive,
  storeTransaction,
  storeTransactionError,
  toSellTab,
  sellWidgetCoinSplit,
  setSellWidgetCoinSplit,
  sellWidgetCalculateDropdownOpen,
  setSellWidgetCalculateDropdownOpen,
  sellWidgetIsCalculating,
  setSellWidgetIsCalculating,
  displayedOusdBalance: displayedOusdBalanceAnimated,
}) => {
  const sellFormHasErrors = Object.values(sellFormErrors).length > 0
  const ousdToSellNumber = parseFloat(ousdToSell) || 0

  const ousdBalance = useStoreState(
    AccountStore,
    (s) => s.balances['ousd'] || 0
  )
  const ousdExchangeRates = useStoreState(
    ContractStore,
    (s) => s.ousdExchangeRates
  )
  const {
    vault: vaultContract,
    viewVault,
    usdt: usdtContract,
    dai: daiContract,
    usdc: usdcContract,
    ousd: ousdContract,
  } = useStoreState(ContractStore, (s) => s.contracts || {})

  const positiveCoinSplitCurrencies = sellWidgetCoinSplit
    .filter((coinSplit) => parseFloat(coinSplit.amount) > 0)
    .map((coinSplit) => coinSplit.coin)

  useEffect(() => {
    // toggle should set values that stay even when it is turned off
    if (sellAllActive) {
      setOusdToSellValue(displayedOusdBalanceAnimated.toString())
    }
  }, [displayedOusdBalanceAnimated])

  useEffect(() => {
    if (sellAllActive) {
      // Note: Not animating this thing, too many contract reads.
      calculateSplits(displayedOusdBalanceAnimated)
    }
  }, [sellAllActive])

  useEffect(() => {
    const newFormErrors = {}
    if (ousdToSell > parseFloat(displayedOusdBalanceAnimated)) {
      newFormErrors.ousd = 'not_have_enough'
    }

    setSellFormErrors(newFormErrors)
  }, [ousdToSell])

  const setOusdToSellValue = (value) => {
    const valueNoCommas = value.replace(',', '')
    setOusdToSell(valueNoCommas)
    setDisplayedOusdToSell(value)
  }

  const onSellNow = async (e) => {
    mixpanel.track('Sell now clicked')
    const returnedCoins = positiveCoinSplitCurrencies.join(',')

    if (sellAllActive) {
      try {
        const result = await vaultContract.redeemAll()
        storeTransaction(result, `redeem`, returnedCoins)
      } catch (e) {
        storeTransactionError(`redeem`, returnedCoins)
        console.error('Error selling all OUSD: ', e)
      }
    } else {
      try {
        const result = await vaultContract.redeem(
          ethers.utils.parseUnits(
            ousdToSell.toString(),
            await ousdContract.decimals()
          )
        )

        storeTransaction(result, `redeem`, returnedCoins)
      } catch (e) {
        storeTransactionError(`redeem`, returnedCoins)
        console.error('Error selling OUSD: ', e)
      }
    }
  }

  let latestCalc
  const calculateSplits = async (sellAmount) => {
    // Note: Should probably use event debounce
    const currTimestamp = Date.now()
    latestCalc = currTimestamp

    setSellWidgetIsCalculating(true)

    try {
      const assetAmounts = await viewVault.calculateRedeemOutputs(
        ethers.utils.parseUnits(
          sellAmount.toString(),
          await ousdContract.decimals()
        )
      )

      const assets = await Promise.all(
        (await viewVault.getAllAssets()).map(async (address, index) => {
          const contracts = ContractStore.currentState.contracts
          const coin = Object.keys(contracts).find(
            (coin) =>
              contracts[coin] &&
              contracts[coin].address.toLowerCase() === address.toLowerCase()
          )

          const amount = ethers.utils.formatUnits(
            assetAmounts[index].toString(),
            await contracts[coin].decimals()
          )

          return {
            coin,
            amount,
          }
        })
      )

      if (latestCalc === currTimestamp) {
        setSellWidgetCoinSplit(assets)
      }
    } catch (err) {
      console.error(err)
      if (latestCalc === currTimestamp) {
        setSellWidgetCoinSplit([])
      }
    }

    if (latestCalc === currTimestamp) {
      setSellWidgetIsCalculating(false)
    }
  }

  return (
    <>
      {ousdBalance > 0 && (
        <div className="sell-table">
          <div className="header d-flex">
            <div>{fbt('Stablecoin', 'Stablecoin')}</div>
            <div className="ml-auto text-right pr-3">
              {fbt('Remaining Balance', 'Remaining Balance')}
            </div>
          </div>
          <div className="d-flex estimation-holder">
            <div
              className={`ousd-estimation d-flex align-items-center justify-content-start ${
                Object.values(sellFormErrors).length > 0 ? 'error' : ''
              }`}
            >
              <div className="estimation-image-holder d-flex align-items-center justify-content-center">
                <img
                  src="/images/currency/ousd-token.svg"
                  alt="OUSD token icon"
                />
              </div>
              {/* This extra div needed for error border style*/}
              <div className="estimation-input-holder d-flex align-items-center">
                <input
                  type="float"
                  placeholder="0.00"
                  value={
                    sellAllActive
                      ? formatCurrency(displayedOusdBalanceAnimated, 6)
                      : displayedOusdToSell
                  }
                  onChange={(e) => {
                    const value =
                      parseFloat(e.target.value) < 0 ? '0' : e.target.value
                    setOusdToSellValue(value)

                    calculateSplits(value)
                  }}
                  onBlur={(e) => {
                    setDisplayedOusdToSell(formatCurrency(ousdToSell, 6))
                  }}
                  onFocus={(e) => {
                    if (!ousdToSell) {
                      setDisplayedOusdToSell('')
                    }
                    if (sellAllActive) {
                      setSellAllActive(false)
                    }
                  }}
                />
                <button
                  className={`sell-all-button ${sellAllActive ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    mixpanel.track('Sell all clicked')
                    setSellAllActive(!sellAllActive)
                  }}
                >
                  <span className="d-flex d-md-none">{fbt('All', 'All')}</span>
                  <span className="d-none d-md-flex">
                    {fbt('Sell all', 'Sell all')}
                  </span>
                </button>
              </div>
            </div>
            <div className="remaining-ousd d-flex align-items-center justify-content-end">
              <div className="balance ml-auto pr-3">
                {formatCurrency(
                  Math.max(0, displayedOusdBalanceAnimated - ousdToSell),
                  6
                )}{' '}
                OUSD
              </div>
            </div>
          </div>
          <div className="horizontal-break" />
          {ousdToSellNumber === 0 && (
            <div className="withdraw-no-ousd-banner d-flex flex-column justify-content-center align-items-center">
              <div className="title">
                {fbt('Enter OUSD amount to sell', 'Enter Ousd to sell')}
              </div>
              <div>
                {fbt(
                  'We will show you a preview of the stablecoins you will receive in exchange. Amount generated will include an exit fee of 0.5%',
                  'Enter Ousd to sell text'
                )}
              </div>
            </div>
          )}
          {ousdToSellNumber > 0 && (
            <>
              <div className="d-flex calculated-holder">
                <div className="grey-text">
                  {fbt('Estimated Stablecoins', 'Estimated Stablecoins')}
                </div>
                <DisclaimerTooltip
                  id="howSaleCalculatedPopover"
                  isOpen={sellWidgetCalculateDropdownOpen}
                  onClose={() => setSellWidgetCalculateDropdownOpen(false)}
                  text={fbt(
                    'The mix of stablecoins you receive from selling OUSD will depend on the current holdings of the vault contract. The amount will depend on exchange rates and will include an exit fee of 0.5% in addition to any exit fees charged by underlying vault strategies. You may receive more or less stablecoins than are shown here.',
                    'The mix of stablecoins you receive from selling OUSD will depend on the current holdings of the vault contract. The amount will depend on exchange rates and will include an exit fee of 0.5% in addition to any exit fees charged by underlying vault strategies. You may receive more or less stablecoins than are shown here.'
                  )}
                >
                  <button
                    className="calculated-toggler"
                    type="button"
                    aria-expanded="false"
                    aria-label="Toggle how it is calculated popover"
                    onClick={(e) => {
                      setSellWidgetCalculateDropdownOpen(
                        !sellWidgetCalculateDropdownOpen
                      )
                    }}
                  >
                    {fbt('How is this calculated?', 'HowCalculated')}
                  </button>
                </DisclaimerTooltip>
              </div>
              <div className="withdraw-section d-flex justify-content-center">
                {sellWidgetIsCalculating
                  ? positiveCoinSplitCurrencies.map((coin) => (
                      <CoinWithdrawBox
                        key={coin}
                        coin={coin}
                        exchangeRate={ousdExchangeRates[coin]}
                        loading
                      />
                    ))
                  : positiveCoinSplitCurrencies
                      .sort((coin) => {
                        switch (coin) {
                          case 'usdt':
                            return -1
                          case 'dai':
                            return 0
                          case 'usdc':
                            return 1
                        }
                      })
                      .map((coin) => {
                        const amount = sellWidgetCoinSplit.filter(
                          (coinSplit) => coinSplit.coin === coin
                        )[0].amount
                        return (
                          <CoinWithdrawBox
                            key={coin}
                            coin={coin}
                            exchangeRate={ousdExchangeRates[coin]}
                            amount={amount}
                          />
                        )
                      })}
              </div>
            </>
          )}
          <div className="actions d-flex flex-md-row flex-column justify-content-center justify-content-md-between">
            <div>
              {Object.values(sellFormErrors).length > 0 && (
                <div className="error-box d-flex align-items-center justify-content-center mb-4 mb-md-0">
                  {fbt(
                    'You don’t have enough ' +
                      fbt.param(
                        'coins',
                        Object.keys(sellFormErrors).join(', ').toUpperCase()
                      ),
                    'You dont have enough stablecoins'
                  )}
                </div>
              )}
            </div>
            <TimelockedButton
              disabled={sellFormHasErrors || !ousdToSell}
              className="btn-blue"
              onClick={onSellNow}
              text={fbt('Sell now', 'Sell now')}
            />
          </div>
        </div>
      )}
      {ousdBalance <= 0 && (
        <div className="no-ousd d-flex flex-column align-items-center justify-content-center">
          <img className="coin" src="/images/ousd-coin.svg" />
          <h2>{fbt('You have no OUSD', 'You have no OUSD')}</h2>
          <a
            className="buy-ousd d-flex align-items-center justify-content-center"
            onClick={(e) => {
              e.preventDefault()
              toSellTab()
            }}
          >
            {fbt('Buy OUSD', 'Buy OUSD')}
          </a>
        </div>
      )}
      <style jsx>{`
        .no-ousd {
          height: 100%;
        }

        .no-ousd .coin {
          width: 94px;
          height: 94px;
          margin-bottom: 30px;
        }

        .no-ousd h2 {
          font-size: 22px;
          line-height: 0.86;
          text-align: center;
          color: black;
          margin-bottom: 45px;
        }

        .buy-ousd {
          height: 50px;
          border-radius: 25px;
          border: solid 1px #1a82ff;
          background-color: #fafbfc;
          padding: 13px 58px;
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          color: #1a82ff;
          cursor: pointer;
        }

        .buy-ousd:hover {
          background-color: #1a82ff12;
        }

        .sell-table .header {
          margin-top: 18px;
        }

        .withdraw-no-ousd-banner {
          font-size: 12px;
          line-height: 1.42;
          text-align: center;
          color: #8293a4;
          min-height: 175px;
          height: 175px;
          border-radius: 5px;
          background-color: #f2f3f5;
          margin-bottom: 28px;
          padding: 60px;
        }

        .withdraw-no-ousd-banner .title {
          font-size: 14px;
          font-weight: bold;
          color: #8293a4;
          margin-bottom: 9px;
        }

        .estimation-holder {
          padding: 0px 5px;
        }

        .ousd-estimation {
          height: 50px;
          width: 50%;
          border-radius: 5px;
          border: solid 1px #cdd7e0;
          background-color: white;
          margin-right: 5px;
          margin-left: -5px;
        }

        .ousd-estimation input {
          width: 125px;
          height: 40px;
          border: 0px;
          font-size: 18px;
          color: black;
          padding: 8px 15px 8px 0px;
          text-align: left;
        }

        .ousd-estimation .estimation-image-holder {
          background-color: #f2f3f5;
          width: 70px;
          height: 50px;
          border-radius: 5px 0px 0px 5px;
          border: solid 1px #cdd7e0;
          margin: -1px;
        }

        .ousd-estimation .estimation-image-holder img {
          width: 30px;
          height: 30px;
        }

        .ousd-estimation input:focus {
          outline: none;
        }

        .estimation-input-holder {
          border-radius: 0px 5px 5px 0px;
          padding: 0px 15px;
          height: 50px;
          flex-grow: 1;
          margin-right: -1px;
        }

        .ousd-estimation.error .estimation-input-holder {
          border: solid 1px #ed2a28;
        }

        .withdraw-section {
          margin-left: -10px;
          margin-right: -10px;
          margin-bottom: 28px;
        }

        .remaining-ousd {
          height: 50px;
          border-radius: 5px;
          border: solid 1px #cdd7e0;
          background-color: #f2f3f5;
          width: 50%;
          margin-left: 5px;
          margin-right: -5px;
        }

        .ousd-estimation .value {
          font-size: 18px;
          color: black;
          padding: 14px;
        }

        .balance {
          font-size: 12px;
          font-size: 12px;
          font-weight: normal;
          text-align: right;
          color: #8293a4;
        }

        .header {
          font-size: 12px;
          font-weight: bold;
          color: #8293a4;
          margin-top: 18px;
          margin-bottom: 9px;
        }

        .header > :first-of-type {
          width: 190px;
        }

        .header > :last-of-type {
          margin-left: 10px;
          width: 350px;
        }

        .horizontal-break {
          width: 100%;
          height: 1px;
          background-color: #dde5ec;
          margin-top: 20px;
          margin-bottom: 20px;
        }

        .error-box {
          font-size: 14px;
          line-height: 1.36;
          text-align: center;
          color: #183140;
          border-radius: 5px;
          border: solid 1px #ed2a28;
          background-color: #fff0f0;
          height: 50px;
          min-width: 320px;
        }

        .sell-all-button {
          height: 18px;
          border-radius: 9px;
          background-color: #f2f3f5;
          font-size: 12px;
          border: 0px;
          color: #8293a4;
          white-space: nowrap;
          padding: 0px 6px;
        }

        .sell-all-button:hover {
          background-color: #e2e3e5;
          color: #728394;
        }

        .sell-all-button.active {
          background-color: #183140;
          color: white;
        }

        .sell-all-button.active:hover {
          background-color: #284150;
          color: white;
        }

        .grey-text {
          font-size: 12px;
          font-weight: bold;
          white-space: nowrap;
          color: #8293a4;
        }

        .calculated-holder {
          margin-bottom: 11px;
        }

        .calculated-toggler {
          font-family: Lato;
          font-size: 12px;
          margin-left: 13px;
          color: #1a82ff;
          border: 0px;
          background-color: transparent;
        }

        @media (max-width: 799px) {
          .withdraw-section {
            margin-left: -5px;
            margin-right: -5px;
            justify-content: space-between;
            margin-bottom: 33px;
          }

          .withdraw-no-ousd-banner {
            min-height: 159px;
            height: 159px;
            padding: 30px;
          }

          .ousd-estimation .estimation-image-holder {
            min-width: 40px;
          }

          .ousd-estimation .estimation-image-holder img {
            width: 25px;
            height: 25px;
          }

          .ousd-estimation input {
            width: 80%;
            padding: 8px 8px 8px 0px;
          }

          .estimation-input-holder {
            padding: 0px 10px;
          }

          .ousd-estimation {
            width: 60%;
          }

          .remaining-ousd {
            width: 40%;
          }
        }
      `}</style>
    </>
  )
}

export default SellWidget