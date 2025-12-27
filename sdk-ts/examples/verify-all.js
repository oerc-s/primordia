/**
 * Verification script - Tests all major SDK functions
 */
import { 
// Core
generateKeypair, hash, canonicalize, 
// RAIL 1
make_msr, verify_msr, net_receipts, make_ian, verify_ian, 
// RAIL 2
make_fc, verify_fc, compute_mbs, verify_mbs, compute_solvency_ratio, compute_runway_seconds, make_dbp, verify_dbp, should_auto_default, 
// RAIL 3
make_amr, verify_amr, make_compute_meter, verify_compute_meter, make_energy_meter, verify_energy_meter } from '../dist/index.js';
let passed = 0;
let failed = 0;
function assert(condition, message) {
    if (condition) {
        console.log('✓', message);
        passed++;
    }
    else {
        console.log('✗', message);
        failed++;
    }
}
async function testCore() {
    console.log('\n=== Testing Core Functions ===');
    const keypair = await generateKeypair();
    assert(keypair.privateKey.length === 64, 'Private key is 64 chars');
    assert(keypair.publicKey.length === 64, 'Public key is 64 chars');
    const data = new TextEncoder().encode('test');
    const hashValue = hash(data);
    assert(hashValue.length === 64, 'Hash is 64 chars (blake3)');
    const canonical = canonicalize({ b: 2, a: 1 });
    assert(canonical === '{"a":1,"b":2}', 'Canonical JSON sorts keys');
}
async function testMSR() {
    console.log('\n=== Testing MSR ===');
    const payer = await generateKeypair();
    const payee = await generateKeypair();
    const msr = await make_msr({
        payer_agent_id: payer.publicKey,
        payee_agent_id: payee.publicKey,
        resource_type: 'api_call',
        units: 100,
        unit_type: 'requests',
        price_usd_micros: 50000,
        scope_hash: 'scope123',
        request_hash: 'req456',
        response_hash: 'resp789'
    }, payer.privateKey);
    assert(msr.msr_version === '0.1', 'MSR version is 0.1');
    assert(msr.signature_ed25519.length === 128, 'MSR signature is 128 chars');
    const verification = await verify_msr(msr, payer.publicKey);
    assert(verification.valid === true, 'MSR verifies successfully');
    assert(verification.hash.length === 64, 'MSR hash is returned');
}
async function testIAN() {
    console.log('\n=== Testing IAN ===');
    const agentA = await generateKeypair();
    const agentB = await generateKeypair();
    const kernel = await generateKeypair();
    const msr1 = await make_msr({
        payer_agent_id: agentA.publicKey,
        payee_agent_id: agentB.publicKey,
        resource_type: 'test',
        units: 100,
        unit_type: 'units',
        price_usd_micros: 100000,
        scope_hash: 'scope1',
        request_hash: 'req1',
        response_hash: 'resp1'
    }, agentA.privateKey);
    const result = net_receipts([msr1]);
    assert(result.obligations.length === 1, 'Netting produces 1 obligation');
    assert(result.obligations[0].amount_usd_micros === 100000, 'Obligation amount is correct');
    const ian = await make_ian('epoch-2025-12', [msr1], kernel.privateKey);
    assert(ian.ian_version === '0.1', 'IAN version is 0.1');
    assert(ian.epoch_id === 'epoch-2025-12', 'IAN epoch_id is correct');
    const ianVerification = await verify_ian(ian, kernel.publicKey);
    assert(ianVerification.valid === true, 'IAN verifies successfully');
}
async function testFC() {
    console.log('\n=== Testing FC ===');
    const issuer = await generateKeypair();
    const fc = await make_fc({
        issuer_agent_id: issuer.publicKey,
        counterparty_agent_id: 'counterparty',
        resource_type: 'gpu_hours',
        units: 100,
        unit_type: 'hours',
        delivery_window: {
            start_ms: Date.now() + 86400000,
            end_ms: Date.now() + 172800000
        },
        penalty: {
            penalty_usd_micros: 1000000,
            rule_hash: 'rule123'
        },
        collateral: 5000000
    }, issuer.privateKey);
    assert(fc.fc_version === '0.1', 'FC version is 0.1');
    assert(fc.commitment_hash.length === 64, 'FC commitment hash exists');
    const verification = await verify_fc(fc, issuer.publicKey);
    assert(verification.valid === true, 'FC verifies successfully');
}
async function testMBS() {
    console.log('\n=== Testing MBS ===');
    const agent = await generateKeypair();
    const assets = [{ asset_type: 'usd', amount: 10000000 }];
    const liabilities = [{ liability_type: 'debt', amount: 3000000 }];
    const ratio = compute_solvency_ratio(assets, liabilities);
    assert(ratio === 33333, 'Solvency ratio calculated correctly');
    const mbs = await compute_mbs({
        agent_id: agent.publicKey,
        assets,
        liabilities,
        burn_rate_usd_micros_per_s: 100
    }, agent.privateKey);
    assert(mbs.mbs_version === '0.1', 'MBS version is 0.1');
    assert(mbs.solvency_ratio === 33333, 'MBS solvency ratio is correct');
    const verification = await verify_mbs(mbs, agent.publicKey);
    assert(verification.valid === true, 'MBS verifies successfully');
    const runway = compute_runway_seconds(mbs);
    assert(runway === 70000, 'Runway calculated correctly');
    const shouldDefault = should_auto_default(1000, 5000);
    assert(shouldDefault === true, 'Should auto-default when runway < threshold');
}
async function testDBP() {
    console.log('\n=== Testing DBP ===');
    const agent = await generateKeypair();
    const arbiter = await generateKeypair();
    const dbp = await make_dbp({
        defaulting_agent_id: agent.publicKey,
        declaration_type: 'VOLUNTARY',
        trigger_type: 'NEGATIVE_MBS',
        trigger_reference_id: 'mbs_ref',
        creditors: [
            {
                agent_id: 'creditor1',
                amount_micros: 2000000,
                priority: 1,
                collateralized: true
            }
        ],
        assets: [
            { asset_type: 'usd', value_micros: 1000000, liquid: true }
        ],
        liquidation_method: 'PRIORITY',
        arbiter_agent_id: arbiter.publicKey,
        arbiter_private_key: arbiter.privateKey
    });
    assert(dbp.dbp_version === '0.1', 'DBP version is 0.1');
    assert(dbp.default_id.length === 64, 'DBP default_id exists');
    assert(dbp.recovery_rate_bps === 5000, 'DBP recovery rate is 50%');
    const verification = await verify_dbp(dbp);
    assert(verification === true, 'DBP verifies successfully');
}
async function testAMR() {
    console.log('\n=== Testing AMR ===');
    const provider = await generateKeypair();
    const consumer = await generateKeypair();
    const amr = await make_amr({
        consumer_agent_id: consumer.publicKey,
        provider_agent_id: provider.publicKey,
        resource_class: 'COMPUTE',
        resource_subtype: 'gpu',
        quantity: 1000,
        unit: 'tokens',
        start_ms: Date.now() - 3600000,
        end_ms: Date.now(),
        attestation_method: 'SIGNED_METER',
        rate_micros_per_unit: 5,
        request_hash: 'req_abc',
        response_hash: 'resp_xyz',
        provider_private_key: provider.privateKey
    });
    assert(amr.amr_version === '0.1', 'AMR version is 0.1');
    assert(amr.record_id.length === 64, 'AMR record_id exists');
    assert(amr.attestation.confidence_bps === 9500, 'AMR confidence is 95%');
    const verification = await verify_amr(amr);
    assert(verification.provider_valid === true, 'AMR provider signature valid');
}
async function testCMR() {
    console.log('\n=== Testing CMR ===');
    const provider = await generateKeypair();
    const consumer = await generateKeypair();
    const cmr = await make_compute_meter({
        provider_id: provider.publicKey,
        consumer_id: consumer.publicKey,
        epoch_id: 'epoch-2025-12',
        start_time: Date.now() - 3600000,
        end_time: Date.now(),
        compute_type: 'GPU',
        quantity: 1.5,
        unit: 'GPU-hours',
        rate: 2.50,
        provider_private_key: provider.privateKey
    });
    assert(cmr.version === '0.1.0', 'CMR version is 0.1.0');
    assert(cmr.receipt_id.startsWith('CMR-'), 'CMR receipt_id starts with CMR-');
    assert(cmr.total_cost === 3.75, 'CMR total cost is correct');
    const verification = await verify_compute_meter(cmr, provider.publicKey);
    assert(verification.valid === true, 'CMR verifies successfully');
}
async function testEMR() {
    console.log('\n=== Testing EMR ===');
    const provider = await generateKeypair();
    const consumer = await generateKeypair();
    const emr = await make_energy_meter({
        provider_id: provider.publicKey,
        consumer_id: consumer.publicKey,
        epoch_id: 'epoch-2025-12',
        start_time: Date.now() - 3600000,
        end_time: Date.now(),
        energy_consumed: 85.5,
        peak_power: 95.2,
        rate: 0.12,
        demand_charge: 2.50,
        provider_private_key: provider.privateKey
    });
    assert(emr.version === '0.1.0', 'EMR version is 0.1.0');
    assert(emr.receipt_id.startsWith('EMR-'), 'EMR receipt_id starts with EMR-');
    assert(Math.abs(emr.total_cost - 12.76) < 0.01, 'EMR total cost is correct');
    const verification = await verify_energy_meter(emr, provider.publicKey);
    assert(verification.valid === true, 'EMR verifies successfully');
}
async function main() {
    console.log('Primordia SDK - Complete Verification');
    console.log('======================================');
    try {
        await testCore();
        await testMSR();
        await testIAN();
        await testFC();
        await testMBS();
        await testDBP();
        await testAMR();
        await testCMR();
        await testEMR();
        console.log('\n======================================');
        console.log(`✓ Passed: ${passed}`);
        console.log(`✗ Failed: ${failed}`);
        console.log('======================================\n');
        if (failed > 0) {
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\nFATAL ERROR:', error);
        process.exit(1);
    }
}
main();
