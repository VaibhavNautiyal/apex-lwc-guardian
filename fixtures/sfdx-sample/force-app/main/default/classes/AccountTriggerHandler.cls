public with sharing class AccountTriggerHandler {
    public static void handle(List<Account> records, Map<Id, Account> oldMap, System.TriggerOperation operation) {
        switch on operation {
            when BEFORE_INSERT, BEFORE_UPDATE {
                setRating(records);
            }
            when AFTER_INSERT {
                createFollowUps(records);
            }
        }
    }

    private static void setRating(List<Account> records) {
        Set<Id> ownerIds = new Set<Id>();
        for (Account acc : records) {
            ownerIds.add(acc.OwnerId);
        }
        Map<Id, User> owners = new Map<Id, User>([SELECT Id, Department FROM User WHERE Id IN :ownerIds]);
        for (Account acc : records) {
            User owner = owners.get(acc.OwnerId);
            acc.Rating = (owner != null && owner.Department == 'Enterprise') ? 'Hot' : 'Warm';
        }
    }

    private static void createFollowUps(List<Account> records) {
        List<Task> followUps = new List<Task>();
        for (Account acc : records) {
            followUps.add(new Task(WhatId = acc.Id, Subject = 'Welcome call'));
        }
        insert followUps;
    }
}
