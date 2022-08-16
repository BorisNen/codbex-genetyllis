/*
 * Copyright (c) 2022 codbex or an codbex affiliate company and contributors
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-FileCopyrightText: 2022 codbex or an codbex affiliate company and contributors
 * SPDX-License-Identifier: EPL-2.0
 */
var query = require("db/v4/query");
var producer = require("messaging/v4/producer");
var daoApi = require("db/v4/dao");
var EntityUtils = require("genetyllis-app/gen/dao/utils/EntityUtils");

var dao = daoApi.create({
	table: "GENETYLLIS_PATIENT",
	properties: [
		{
			name: "Id",
			column: "PATIENT_ID",
			type: "INTEGER",
			id: true,
			autoIncrement: true,
		}, {
			name: "LabId",
			column: "GENETYLLIS_PATIENT_LABID",
			type: "VARCHAR",
		}, {
			name: "BirthDate",
			column: "PATIENT_AGE",
			type: "DATE",
		}, {
			name: "GenderId",
			column: "PATIENT_GENDERID",
			type: "INTEGER",
		}, {
			name: "Info",
			column: "PATIENT_INFO",
			type: "VARCHAR",
		}, {
			name: "PhysicianId",
			column: "GENETYLLIS_PATIENT_PHYSICIANID",
			type: "INTEGER",
		}, {
			name: "PopulationId",
			column: "GENETYLLIS_PATIENT_POPULATIONID",
			type: "INTEGER",
		}]
});

exports.list = function(settings) {
	return dao.list(settings).map(function (e) {
		EntityUtils.setLocalDate(e, "BirthDate");
		return e;
	});
};

exports.get = function(id) {
	var entity = dao.find(id);
	// TODO this produces 500
	// EntityUtils.setLocalDate(entity, "BirthDate");
	return entity;
};

exports.create = function (entity) {
	EntityUtils.setLocalDate(entity, "BirthDate");
	var id = dao.insert(entity);
	triggerEvent("Create", {
		table: "GENETYLLIS_PATIENT",
		key: {
			name: "Id",
			column: "PATIENT_ID",
			value: id
		}
	});
	return id;
};

exports.update = function (entity) {
	EntityUtils.setLocalDate(entity, "BirthDate");
	dao.update(entity);
	triggerEvent("Update", {
		table: "GENETYLLIS_PATIENT",
		key: {
			name: "Id",
			column: "PATIENT_ID",
			value: entity.Id
		}
	});
};

exports.delete = function (id) {
	dao.remove(id);
	triggerEvent("Delete", {
		table: "GENETYLLIS_PATIENT",
		key: {
			name: "Id",
			column: "PATIENT_ID",
			value: id
		}
	});
};

exports.count = function () {
	return dao.count();
};

exports.customDataCount = function () {
	var resultSet = query.execute("SELECT COUNT(*) AS COUNT FROM GENETYLLIS_PATIENT");
	if (resultSet !== null && resultSet[0] !== null) {
		if (resultSet[0].COUNT !== undefined && resultSet[0].COUNT !== null) {
			return resultSet[0].COUNT;
		} else if (resultSet[0].count !== undefined && resultSet[0].count !== null) {
			return resultSet[0].count;
		}
	}
	return 0;
};

exports.getPatientByLabId = function (labId) {
	paramArr = [];
	paramArr.push(labId)
	var resultSet = query.execute("SELECT * FROM GENETYLLIS_PATIENT WHERE GENETYLLIS_PATIENT_LABID = ? LIMIT 1", paramArr);
	return resultSet;
}

exports.getPatientAndHistoryByLabId = function (labId) {
	paramArr = [];
	paramArr.push(labId)
	var resultSet = query.execute("SELECT * FROM GENETYLLIS_PATIENT GP " +
		"JOIN GENETYLLIS_CLINICALHISTORY GC ON GP.PATIENT_ID = GC.CLINICALHISTORY_PATIENTID " +
		"JOIN GENETYLLIS_FAMILYHISTORY GF ON GP.PATIENT_ID = GF.FAMILYHISTORY_FAMILYMEMBERID  WHERE GENETYLLIS_PATIENT_LABID = ?", paramArr);
	return resultSet;
}

function triggerEvent(operation, data) {
	producer.queue("genetyllis-app/patients/Patient/" + operation).send(JSON.stringify(data));
}
