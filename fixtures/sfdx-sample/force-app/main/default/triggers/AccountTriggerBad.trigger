trigger AccountTriggerBad on Account (before insert, before update, after insert) {
    if (Trigger.isBefore) {
        Set<Id> ownerIds = new Set<Id>();
        for (Account acc : Trigger.new) {
            ownerIds.add(acc.OwnerId);
        }
        Map<Id, User> owners = new Map<Id, User>([SELECT Id, Department FROM User WHERE Id IN :ownerIds]);
        for (Account acc : Trigger.new) {
            User owner = owners.get(acc.OwnerId);
            if (owner != null && owner.Department == 'Enterprise') {
                acc.Rating = 'Hot';
            } else {
                acc.Rating = 'Warm';
            }
        }
    }
    if (Trigger.isAfter && Trigger.isInsert) {
        List<Task> followUps = new List<Task>();
        for (Account acc : Trigger.new) {
            followUps.add(new Task(WhatId = acc.Id, Subject = 'Welcome call'));
        }
        insert followUps;
    }
}
