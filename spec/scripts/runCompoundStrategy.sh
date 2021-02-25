strategy='CompoundStrategy'
rule=${1}
certoraRun contracts/strategies/${strategy}.sol contracts/mocks/MockCToken.sol ../spec/harnesses/DummyERC20A.sol ../spec/harnesses/ComptrollerHarness.sol \
  --link MockCToken:underlyingToken=DummyERC20A \
  --staging \
  --verify ${strategy}:../spec/compoundStrategy.spec \
  --cache strategy \
  --solc solc5.11 \
  --settings -assumeUnwindCond,-b=2,-t=300,-enableStorageAnalysis=true \
  --msg "Strategy ${strategy}-${rule} verification" \
  --rule ${rule}