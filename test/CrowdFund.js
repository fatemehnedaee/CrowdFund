const { ethers } = require("hardhat");
const { expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CrowdFund",function() {

    let myToken;
    let crowdFund;
    let owner, signer1, signer2, signer3;
    let timestampBefore;
    let startTime;
    let endTime;
    
    before(async function() {
        [owner, signer1, signer2, signer3] = await ethers.getSigners();

        const MyToken = await ethers.getContractFactory("MyToken");
        myToken = await MyToken.deploy(owner.address);
        myToken.mint(signer2.address, ethers.parseEther("1000"));

        const CrowdFund = await ethers.getContractFactory("CrowdFund");
        crowdFund = await CrowdFund.deploy(await myToken.getAddress());

        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        timestampBefore = blockBefore.timestamp;
        startTime = timestampBefore + 86400;
        endTime = timestampBefore + 259200;
    })

    describe("constructor", function() {
        it("token should be stored", async function() {
            expect(await crowdFund.token()).to.equal(await myToken.getAddress());
        })
    })

    describe("lunch", function() {
        it("should revert if goal is zero", async function() {
            await expect(crowdFund.lunch(ethers.parseEther("0"), startTime, endTime))
                .to.be.revertedWithCustomError(crowdFund, "InvalidGoal");
        })

        it("should be revert if start time is less than current time or end time is less than start time", async function() {
            await expect(crowdFund.lunch(ethers.parseEther("30"), timestampBefore - 1000, endTime))
                .to.be.revertedWithCustomError(crowdFund, "InvalidTimes");
            await expect(crowdFund.lunch(ethers.parseEther("30"), startTime, startTime))
                .to.be.revertedWithCustomError(crowdFund, "InvalidTimes");
            await expect(crowdFund.lunch(ethers.parseEther("30"), timestampBefore - 1000, timestampBefore - 1000))
                .to.be.revertedWithCustomError(crowdFund, "InvalidTimes");
        })

        it("successful lunch Transaction", async function() {
            await expect(crowdFund.connect(signer1).lunch(ethers.parseEther("30"), startTime, endTime))
                .to.emit(crowdFund, "lunched")
                .withArgs([signer1.address, ethers.parseEther("30"), startTime, endTime, 0]);
            expect(await crowdFund.campaigns(0)).to.deep.equal([signer1.address, ethers.parseEther("30"), startTime, endTime, 0]);
            expect(await crowdFund.id()).to.equal(1);

        })
    })

    describe("pledge", function() {
        it("should revert if amount is zero", async function() {
            await expect(crowdFund.pledge(0, 0)).to.be.revertedWithCustomError(crowdFund, "InvalidAmount");
        })

        it("should be revert if campaign isn't start or campaign is end", async function() {
            await expect(crowdFund.pledge(0, ethers.parseEther("30")))
                .to.be.revertedWithCustomError(crowdFund, "InvalidCampaign");
        })

        it("successful pledge Transaction", async function() {
            timestampBefore = await helpers.time.increase(86410);
            await myToken.connect(signer2).approve(await crowdFund.getAddress(), ethers.parseEther("10"));
            await expect(crowdFund.connect(signer2).pledge(0, ethers.parseEther("10")))
                .to.emit(crowdFund, "Pledge")
                .withArgs(signer2.address, 0, ethers.parseEther("10"), ethers.parseEther("10"));
            expect(await myToken.balanceOf(crowdFund.getAddress())).to.equal(ethers.parseEther("10"));
            expect((await crowdFund.campaigns(0))[4]).to.equal(ethers.parseEther("10"));
            expect(await crowdFund.pledgeAmounts(0, signer2.address)).to.equal(ethers.parseEther("10"));
        })
    })

    describe("unPledge", function() {
        it("should be revert if campaign is end", async function() {
            timestampBefore = await helpers.time.increase(259200);
            await expect(crowdFund.connect(signer2).unPledge(0)).to.be.revertedWithCustomError(crowdFund, "EndedCampaign");
        })

        it("successful unpledge Transaction", async function() {
            startTime = timestampBefore + 86400;
            endTime = timestampBefore + 259200;
            await crowdFund.connect(signer1).lunch(ethers.parseEther("30"), startTime, endTime);
            timestampBefore = await helpers.time.increase(86410);
            await myToken.connect(signer2).approve(await crowdFund.getAddress(), ethers.parseEther("10"));
            await crowdFund.connect(signer2).pledge(1, ethers.parseEther("10"));
            await expect(crowdFund.connect(signer2).unPledge(1))
                .to.emit(crowdFund, "Unpledge")
                .withArgs(signer2.address, 1, ethers.parseEther("10"), 0);
            expect(await myToken.balanceOf(signer2.address)).to.equal(ethers.parseEther("990"));
            expect((await crowdFund.campaigns(0))[4]).to.equal(ethers.parseEther("10"));
            expect(await crowdFund.pledgeAmounts(1, signer2.address)).to.equal(0);
        })
    })

    describe("claim", function() {
        it("should be revert if msgsender isn't creator", async function() {
            await expect(crowdFund.connect(signer3).claim(1)).to.be.revertedWithCustomError(crowdFund, "InvalidMsgSender");
        })

        it("should be revert if the campaign did not reach goal", async function() {
            await expect(crowdFund.connect(signer1).claim(1)).to .be.revertedWithCustomError(crowdFund, "InvalidGoal");
        })

        it("should be revert if campaign isn't end", async function() {
            await myToken.connect(signer2).approve(await crowdFund.getAddress(), ethers.parseEther("30"));
            await crowdFund.connect(signer2).pledge(1, ethers.parseEther("30"));
            await expect(crowdFund.connect(signer1).claim(1)).to.be.revertedWithCustomError(crowdFund, "InvalidCampaign");
        })

        it("successful claim Transaction", async function() {
            timestampBefore = await helpers.time.increase(259200);
            await expect(crowdFund.connect(signer1).claim(1))
                .to.emit(crowdFund, "Claimed")
                .withArgs([signer1.address, ethers.parseEther("30"), startTime, endTime, 0]);
            expect((await crowdFund.campaigns(1))[4]).to.equal(0);
            expect(await myToken.balanceOf(signer1.address)).to.equal(ethers.parseEther("30"));
        })
    })

    describe("refund", function() {
        it("should be revert if campaign is not end", async function() {
            startTime = timestampBefore + 86400;
            endTime = timestampBefore + 259200;
            await crowdFund.connect(signer1).lunch(ethers.parseEther("30"), startTime, endTime);
            timestampBefore = await helpers.time.increase(86410);
            await myToken.connect(signer2).approve(await crowdFund.getAddress(), ethers.parseEther("10"));
            await crowdFund.connect(signer2).pledge(2, ethers.parseEther("10"));
            await expect(crowdFund.connect(signer2).refund(2)).to.be.revertedWithCustomError(crowdFund, "InvalidCampaign");
        })

        it("should be revet if the campaign did not reach goal", async function() {
            await myToken.connect(signer2).approve(await crowdFund.getAddress(), ethers.parseEther("20"));
            await crowdFund.connect(signer2).pledge(2, ethers.parseEther("20"));
            timestampBefore = await helpers.time.increase(259200);
            await expect(crowdFund.connect(signer2).refund(2)).to.be.revertedWithCustomError(crowdFund,"InvalidGoal");
        })

        it("successful refund Transaction", async function() {
            startTime = timestampBefore + 86400;
            endTime = timestampBefore + 259200;
            await crowdFund.connect(signer1).lunch(ethers.parseEther("30"), startTime, endTime);
            timestampBefore = await helpers.time.increase(86410);
            await myToken.connect(signer2).approve(await crowdFund.getAddress(), ethers.parseEther("10"));
            await crowdFund.connect(signer2).pledge(3, ethers.parseEther("10"));
            timestampBefore = await helpers.time.increase(259200);
            await crowdFund.connect(signer2).refund(3);
            expect((await crowdFund.campaigns(3))[4]).to.equal(0);
        })
    })

    describe("cancle", function() {
        it("should be revert if msgsender isn't creator", async function() {
            startTime = timestampBefore + 86400;
            endTime = timestampBefore + 259200;
            await crowdFund.connect(signer1).lunch(ethers.parseEther("30"), startTime, endTime);
            await expect(crowdFund.connect(signer2).cancle(4)).to.be.revertedWithCustomError(crowdFund, "InvalidMsgSender");
        })

        it("should be revert if campaign is started", async function() {
            await expect(crowdFund.connect(signer1).cancle(3)).to.be.revertedWithCustomError(crowdFund, "startedCampaign");
        })

        it("successful cancle transaction", async function() {
            await expect(crowdFund.connect(signer1).cancle(4))
                .to.emit(crowdFund, "Cancled")
                .withArgs([signer1.address, ethers.parseEther("30"), startTime, endTime, 0]);
            expect(await crowdFund.campaigns(4)).to.deep.equal([ethers.ZeroAddress, 0, 0, 0, 0]);
        })
    })
})