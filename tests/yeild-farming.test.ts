import { describe, test, expect, beforeEach } from 'vitest';
import {
  mocknet,
  Chain,
  Account,
  ReadOnlyFn,
  Contract,
  Tx,
} from '@stacks/stacks-network-mock';

describe('Sustainable Yield Farming Contract', () => {
  let chain: Chain;
  let deployer: Account;
  let farmer1: Account;
  let yieldFarmer1: Account;
  let yieldFarmer2: Account;
  let contract: Contract;
  
  // Constants used in tests
  const FARMER_ID = 1;
  const POOL_ID = 1;
  const MIN_STAKE = 1000000; // 1M microSTX
  const APY = 1000; // 10%
  const TOTAL_LAND = 100; // 100 acres
  const CROP_TYPE = "wheat";
  const YIELD_ESTIMATE = 5000; // 5000 bushels
  
  beforeEach(async () => {
    // Initialize the mocknet
    chain = await mocknet();
    
    // Create test accounts
    deployer = await chain.createAccount();
    farmer1 = await chain.createAccount();
    yieldFarmer1 = await chain.createAccount();
    yieldFarmer2 = await chain.createAccount();
    
    // Deploy the contract
    const contractSource = '...'; // Contract source code from previous artifact
    contract = await chain.deployContract('sustainable-farming', contractSource, deployer);
  });
  
  describe('Farmer Registration', () => {
    test('should successfully register a farmer', async () => {
      const tx = await contract.callPublic('register-farmer', [
        FARMER_ID,
        TOTAL_LAND,
        CROP_TYPE
      ], deployer);
      
      expect(tx.success).toBe(true);
      
      const farmer = await contract.callReadOnly('get-farmer', [FARMER_ID]);
      expect(farmer).toEqual({
        address: deployer.address,
        active: true,
        totalLand: TOTAL_LAND,
        cropType: CROP_TYPE,
        yieldEstimate: 0
      });
    });
    
    test('should fail when non-owner tries to register farmer', async () => {
      const tx = await contract.callPublic('register-farmer', [
        FARMER_ID,
        TOTAL_LAND,
        CROP_TYPE
      ], farmer1);
      
      expect(tx.success).toBe(false);
      expect(tx.error).toContain('err-not-owner');
    });
  });
  
  describe('Pool Creation and Management', () => {
    test('should successfully create a farming pool', async () => {
      const tx = await contract.callPublic('create-pool', [
        POOL_ID,
        FARMER_ID,
        APY,
        MIN_STAKE
      ], deployer);
      
      expect(tx.success).toBe(true);
      
      const pool = await contract.callReadOnly('get-pool', [POOL_ID]);
      expect(pool).toBeDefined();
      expect(pool.totalStaked).toBe(0);
      expect(pool.farmerId).toBe(FARMER_ID);
      expect(pool.apy).toBe(APY);
    });
    
    test('should fail to create pool with insufficient minimum stake', async () => {
      const tx = await contract.callPublic('create-pool', [
        POOL_ID,
        FARMER_ID,
        APY,
        MIN_STAKE - 1
      ], deployer);
      
      expect(tx.success).toBe(false);
      expect(tx.error).toContain('err-insufficient-stake');
    });
  });
  
  describe('Staking Operations', () => {
    beforeEach(async () => {
      // Setup: Register farmer and create pool
      await contract.callPublic('register-farmer', [
        FARMER_ID,
        TOTAL_LAND,
        CROP_TYPE
      ], deployer);
      
      await contract.callPublic('create-pool', [
        POOL_ID,
        FARMER_ID,
        APY,
        MIN_STAKE
      ], deployer);
    });
    
    test('should successfully stake tokens', async () => {
      const stakeAmount = MIN_STAKE * 2;
      const tx = await contract.callPublic('stake-tokens', [
        POOL_ID,
        stakeAmount
      ], yieldFarmer1);
      
      expect(tx.success).toBe(true);
      
      const yieldFarmer = await contract.callReadOnly('get-yield-farmer', [yieldFarmer1.address]);
      expect(yieldFarmer.stakedAmount).toBe(stakeAmount);
    });
    
    test('should fail when staking below minimum amount', async () => {
      const tx = await contract.callPublic('stake-tokens', [
        POOL_ID,
        MIN_STAKE - 1
      ], yieldFarmer1);
      
      expect(tx.success).toBe(false);
      expect(tx.error).toContain('err-insufficient-stake');
    });
  });
  
  describe('Rewards Calculation and Claims', () => {
    beforeEach(async () => {
      // Setup: Create pool and stake tokens
      await contract.callPublic('create-pool', [
        POOL_ID,
        FARMER_ID,
        APY,
        MIN_STAKE
      ], deployer);
      
      await contract.callPublic('stake-tokens', [
        POOL_ID,
        MIN_STAKE * 2
      ], yieldFarmer1);
      
      // Advance blockchain by 1 day
      await chain.mineEmptyBlock(144);
    });
    
    test('should calculate rewards correctly', async () => {
      const rewards = await contract.callReadOnly('calculate-rewards', [
        yieldFarmer1.address,
        POOL_ID
      ]);
      
      expect(rewards).toBeDefined();
      expect(Number(rewards)).toBeGreaterThan(0);
    });
    
    test('should successfully claim rewards', async () => {
      const tx = await contract.callPublic('claim-rewards', [
        POOL_ID
      ], yieldFarmer1);
      
      expect(tx.success).toBe(true);
      
      const yieldFarmer = await contract.callReadOnly('get-yield-farmer', [yieldFarmer1.address]);
      expect(yieldFarmer.rewards).toBe(0);
      expect(yieldFarmer.lastClaimHeight).toBe(await chain.getBlockHeight());
    });
  });
  
  describe('Yield Updates', () => {
    beforeEach(async () => {
      await contract.callPublic('register-farmer', [
        FARMER_ID,
        TOTAL_LAND,
        CROP_TYPE
      ], deployer);
    });
    
    test('should successfully update yield estimate', async () => {
      const tx = await contract.callPublic('update-yield-estimate', [
        FARMER_ID,
        YIELD_ESTIMATE
      ], deployer);
      
      expect(tx.success).toBe(true);
      
      const farmer = await contract.callReadOnly('get-farmer', [FARMER_ID]);
      expect(farmer.yieldEstimate).toBe(YIELD_ESTIMATE);
    });
    
    test('should fail when non-owner updates yield estimate', async () => {
      const tx = await contract.callPublic('update-yield-estimate', [
        FARMER_ID,
        YIELD_ESTIMATE
      ], farmer1);
      
      expect(tx.success).toBe(false);
      expect(tx.error).toContain('err-not-owner');
    });
  });
  
  describe('Emergency Operations', () => {
    beforeEach(async () => {
      await contract.callPublic('create-pool', [
        POOL_ID,
        FARMER_ID,
        APY,
        MIN_STAKE
      ], deployer);
    });
    
    test('should successfully execute emergency shutdown', async () => {
      const tx = await contract.callPublic('emergency-shutdown', [
        POOL_ID
      ], deployer);
      
      expect(tx.success).toBe(true);
      
      const pool = await contract.callReadOnly('get-pool', [POOL_ID]);
      expect(pool.endHeight).toBe(await chain.getBlockHeight());
    });
    
    test('should fail when non-owner attempts emergency shutdown', async () => {
      const tx = await contract.callPublic('emergency-shutdown', [
        POOL_ID
      ], yieldFarmer1);
      
      expect(tx.success).toBe(false);
      expect(tx.error).toContain('err-not-owner');
    });
  });
});
