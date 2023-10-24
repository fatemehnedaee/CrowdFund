// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

contract CrowdFund {

    IERC20 public token;
    uint public id;

    struct Campaign {
        address creator;
        uint goal;
        uint startTime;
        uint endTime;
        uint totalAmount;
    }

    mapping (uint => Campaign) public campaigns;
    mapping (uint => mapping (address => uint)) public pledgeAmounts;

    event lunched(Campaign campaign);
    event Pledge(address pledger, uint campaignId, uint amount, uint totalAmount);
    event Unpledge(address unpledger, uint campaignId, uint amount, uint totalAmount);
    event Claimed(Campaign campaign);
    event Cancled(Campaign campaign);

    error InvalidGoal();
    error InvalidTimes();
    error InvalidAmount();
    error InvalidCampaign();
    error startedCampaign();
    error EndedCampaign();
    error InvalidMsgSender();

    constructor(IERC20 _token) {
        token = _token;
    }
    
    function lunch(uint _goal, uint _startTime, uint _endTime) external {
        uint currentTime = block.timestamp;
        if(_goal <= 0) {
            revert InvalidGoal();
        }
        if(_startTime < currentTime || _endTime <= _startTime) {
            revert InvalidTimes();
        }
        campaigns[id] = Campaign(msg.sender, _goal, _startTime, _endTime, 0);
        emit lunched(campaigns[id]);
        id += 1;
    }

    function pledge(uint _id, uint _amout) external payable {
        uint currentTime = block.timestamp;
        if(_amout <= 0) {
            revert InvalidAmount();
        }
        if(campaigns[_id].startTime > currentTime || campaigns[_id].endTime <= currentTime) {
            revert InvalidCampaign();
        }
        token.transferFrom(msg.sender, address(this), _amout);
        campaigns[_id].totalAmount += _amout;
        pledgeAmounts[_id][msg.sender] = _amout;
        emit Pledge(msg.sender, _id, _amout, campaigns[_id].totalAmount);
    }

    function unPledge(uint _id) external payable{
        uint _amout = pledgeAmounts[_id][msg.sender];
        uint currentTime = block.timestamp;
        if(campaigns[_id].endTime <= currentTime) {
            revert EndedCampaign();
        }
        token.transfer(msg.sender, _amout);
        campaigns[_id].totalAmount -= _amout;
        delete pledgeAmounts[_id][msg.sender];
        emit Unpledge(msg.sender, _id, _amout, campaigns[_id].totalAmount);
    }

    function claim(uint _id) external payable{
        if(msg.sender != campaigns[_id].creator) {
            revert InvalidMsgSender();
        }
        if(campaigns[_id].totalAmount < campaigns[_id].goal) {
            revert InvalidGoal();
        }
        if(block.timestamp < campaigns[_id].endTime) {
            revert InvalidCampaign();
        }
        token.transfer(msg.sender, campaigns[_id].totalAmount);
        campaigns[_id].totalAmount = 0;
        emit Claimed(campaigns[_id]);
    }

    function refund(uint _id) external payable {
        if(block.timestamp < campaigns[_id].endTime) {
            revert InvalidCampaign();
        }
        if(campaigns[_id].totalAmount >= campaigns[_id].goal) {
            revert InvalidGoal();
        }
        uint _amout = pledgeAmounts[_id][msg.sender];
        token.transfer(msg.sender, _amout);
        campaigns[_id].totalAmount -= _amout;
        delete pledgeAmounts[_id][msg.sender];
    }

    function cancle(uint _id) external {
        if(msg.sender != campaigns[_id].creator) {
            revert InvalidMsgSender();
        }
        if(campaigns[_id].startTime <= block.timestamp) {
            revert startedCampaign();
        }
        emit Cancled(campaigns[_id]);
        delete campaigns[_id];
    }
}