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
var httpClient = require("http/v4/client");
var daoVariantRecord = require("genetyllis-app/gen/dao/records/VariantRecord");
var daoVariant = require("genetyllis-app/gen/dao/variants/Variant");
var daoGene = require("genetyllis-app/gen/dao/genes/Gene");
var daoFilter = require("genetyllis-app/gen/dao/records/Filter");
var daoClinicalSignificance = require("genetyllis-app/gen/dao/variants/ClinicalSignificance");
var daoPathology = require("genetyllis-app/gen/dao/nomenclature/Pathology");
var daoAlleleFreqeuncy = require("genetyllis-app/gen/dao/variants/AlleleFrequency.js");

exports.updateTrigger = function (variantId) {
    updateVariant(variantId);
}

function updateVariant(variantId) {
    console.log(variantId);
    if (!variantId) {
        console.log("VariantId has to be set as a parameter in the URL");
        return;
    }
    patientId = 1;

    //VARIANT
    let entityVariant = {};
    var statement = "SELECT * FROM GENETYLLIS_VARIANT WHERE VARIANT_ID= ?";
    var resultset = query.execute(statement, [variantId], "local", "DefaultDB");

    entityVariant.Id = resultset[0].VARIANT_ID;
    entityVariant.HGVS = resultset[0].VARIANT_HGVS;
    entityVariant.GeneId = resultset[0].VARIANT_GENEID;
    console.log(entityVariant.HGVS);

    var httpResponse = httpClient.get("https://myvariant.info/v1/variant/" + entityVariant.HGVS);
    const myVariantJSON = JSON.parse(httpResponse.text);

    if (!myVariantJSON.error) {
        if (myVariantJSON.cadd !== undefined && myVariantJSON.cadd.consequence !== undefined)
            entityVariant.Consequence = JSON.stringify(myVariantJSON.cadd.consequence);
        else
            entityVariant.Consequence = "";

        if (myVariantJSON.cadd !== undefined && myVariantJSON.cadd.consdetail !== undefined)
            entityVariant.ConsequenceDetails = JSON.stringify(myVariantJSON.cadd.consdetail);
        else
            entityVariant.ConsequenceDetails = "";

        if (myVariantJSON.cadd !== undefined && myVariantJSON.cadd.exon !== undefined) {
            entityVariant.Region = "exon";
            entityVariant.RegionNum = JSON.stringify(myVariantJSON.cadd.exon);
        }
        else if (myVariantJSON.cadd !== undefined && myVariantJSON.cadd.intron !== undefined) {
            entityVariant.Region = "intron";
            entityVariant.RegionNum = JSON.stringify(myVariantJSON.cadd.intron);
        }
        else {
            entityVariant.Region = "";
            entityVariant.RegionNum = "";
        }

        //GENE
        if (myVariantJSON.dbsnp !== undefined && myVariantJSON.dbsnp.gene !== undefined) {
            console.log("GENE");
            var statement = "SELECT VARIANT_GENEID FROM GENETYLLIS_VARIANT WHERE VARIANT_ID = ?";
            var resultset = query.execute(statement, [entityVariant.Id], "local", "DefaultDB");

            if (resultset[0] !== undefined && resultset[0].VARIANT_GENEID !== undefined) {
                let entityGene = {};
                entityGene.Id = resultset[0].VARIANT_GENEID;

                geneArray = myVariantJSON.dbsnp.gene;
                if (geneArray.length !== undefined) {
                    geneArray.forEach(gene => {

                        entityGene.GeneId = gene.geneid;
                        //TODO change later to include full string
                        entityGene.Name = JSON.stringify(gene.name).substring(0, 19);
                        entityGene.Pseudo = gene.is_pseudo;

                        daoGene.update(entityGene);
                    });
                } else {
                    entityGene.GeneId = myVariantJSON.dbsnp.gene.geneid;
                    //TODO change later to include full string
                    entityGene.Name = JSON.stringify(myVariantJSON.dbsnp.gene.name).substring(0, 19);
                    entityGene.Pseudo = myVariantJSON.dbsnp.gene.is_pseudo;

                    daoGene.update(entityGene);
                }
            } else {
                console.log("GENE create");

                geneArray = myVariantJSON.dbsnp.gene;

                if (geneArray.length !== undefined) {
                    geneArray.forEach(gene => {
                        let entityGene = {};
                        entityGene.GeneId = gene.geneid;
                        //TODO change later to include full string
                        entityGene.Name = JSON.stringify(gene.name).substring(0, 19);
                        entityGene.Pseudo = gene.is_pseudo;

                        entityVariant.GeneId = daoGene.create(entityGene);
                        console.log("gene id" + entityVariant.GeneId);
                        daoVariant.update(entityVariant)
                    });
                } else {
                    let entityGene = {};
                    entityGene.GeneId = myVariantJSON.dbsnp.gene.geneid;
                    //TODO change later to include full string
                    entityGene.Name = JSON.stringify(myVariantJSON.dbsnp.gene.name).substring(0, 19);
                    entityGene.Pseudo = myVariantJSON.dbsnp.gene.is_pseudo;

                    entityVariant.GeneId = daoGene.create(entityGene);
                    console.log("gene id" + entityVariant.GeneId);
                    daoVariant.update(entityVariant)
                }
            }
        }

        //CLINICAL SIGNIFICANCE
        if (myVariantJSON.clinvar !== undefined && myVariantJSON.clinvar.rcv !== undefined) {
            console.log("CLINSIG");

            let entityClinicalSignificance = {};
            var statement = "SELECT * FROM GENETYLLIS_CLINICALSIGNIFICANCE WHERE CLINICALSIGNIFICANCE_VARIANTID = ?";
            var resultset = query.execute(statement, [entityVariant.Id], "local", "DefaultDB");

            if (resultset[0] !== undefined) {
                entityClinicalSignificance.Id = resultset[0].CLINICALSIGNIFICANCE_VARIANTID;

                var rcvArray = myVariantJSON.clinvar.rcv;

                if (rcvArray.length !== undefined) {
                    rcvArray.forEach((rcv) => {
                        var conditionsArray = rcv.conditions;
                        if (conditionsArray.length !== undefined) {
                            conditionsArray.forEach((conditions) => {
                                if (conditions.identifiers !== undefined) {
                                    console.log("multiple conditions with identifiers");
                                    var statement =
                                        "SELECT PATHOLOGY_ID FROM GENETYLLIS_PATHOLOGY WHERE PATHOLOGY_CUI = ?";
                                    var resultset = query.execute(
                                        statement,
                                        [conditions.identifiers.medgen],
                                        "local",
                                        "DefaultDB"
                                    );

                                    resultset.forEach((clinsig) => {
                                        entityClinicalSignificance.VariantId = entityVariant.Id;
                                        entityClinicalSignificance.PathologyId = clinsig.PATHOLOGY_ID;
                                        switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                            case "Pathogenic":
                                                entityClinicalSignificance.Significance = 1;
                                                break;
                                            case "Likely pathogenic":
                                                entityClinicalSignificance.Significance = 2;
                                                break;
                                            case "Uncertain":
                                                entityClinicalSignificance.Significance = 3;
                                                break;
                                            case "Likely bening":
                                                entityClinicalSignificance.Significance = 4;
                                                break;
                                            case "Bening":
                                                entityClinicalSignificance.Significance = 5;
                                                break;
                                            default:
                                                entityClinicalSignificance.Significance = null;
                                        }

                                        entityClinicalSignificance.Evaluated =
                                            myVariantJSON.clinvar.rcv.last_evaluated;
                                        entityClinicalSignificance.ReviewStatus =
                                            myVariantJSON.clinvar.rcv.review_status;
                                        entityClinicalSignificance.Update = Date.now;

                                        daoClinicalSignificance.update(entityClinicalSignificance);
                                    });

                                } else {
                                    // console.log("multiple conditions without identifiers");

                                    entityClinicalSignificance.VariantId = entityVariant.Id;
                                    switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                        case "Pathogenic":
                                            entityClinicalSignificance.Significance = 1;
                                            break;
                                        case "Likely pathogenic":
                                            entityClinicalSignificance.Significance = 2;
                                            break;
                                        case "Uncertain":
                                            entityClinicalSignificance.Significance = 3;
                                            break;
                                        case "Likely bening":
                                            entityClinicalSignificance.Significance = 4;
                                            break;
                                        case "Bening":
                                            entityClinicalSignificance.Significance = 5;
                                            break;
                                        default:
                                            entityClinicalSignificance.Significance = null;
                                    }

                                    entityClinicalSignificance.Evaluated =
                                        myVariantJSON.clinvar.rcv.last_evaluated;
                                    entityClinicalSignificance.ReviewStatus =
                                        myVariantJSON.clinvar.rcv.review_status;
                                    entityClinicalSignificance.Update = Date.now;

                                    daoClinicalSignificance.update(entityClinicalSignificance);
                                }
                            });
                        } else {
                            if (rcv.conditions.identifiers !== undefined) {
                                var statement =
                                    "SELECT PATHOLOGY_ID FROM GENETYLLIS_PATHOLOGY WHERE PATHOLOGY_CUI = ?";
                                var resultset = query.execute(
                                    statement,
                                    [rcv.conditions.identifiers.medgen],
                                    "local",
                                    "DefaultDB"
                                );

                                resultset.forEach((clinsig) => {
                                    let entityClinicalSignificance = {};
                                    entityClinicalSignificance.VariantId = entityVariant.Id;
                                    entityClinicalSignificance.PathologyId = clinsig.PATHOLOGY_ID;
                                    switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                        case "Pathogenic":
                                            entityClinicalSignificance.Significance = 1;
                                            break;
                                        case "Likely pathogenic":
                                            entityClinicalSignificance.Significance = 2;
                                            break;
                                        case "Uncertain":
                                            entityClinicalSignificance.Significance = 3;
                                            break;
                                        case "Likely bening":
                                            entityClinicalSignificance.Significance = 4;
                                            break;
                                        case "Bening":
                                            entityClinicalSignificance.Significance = 5;
                                            break;
                                        default:
                                            entityClinicalSignificance.Significance = null;
                                    }

                                    entityClinicalSignificance.Evaluated =
                                        myVariantJSON.clinvar.rcv.last_evaluated;
                                    entityClinicalSignificance.ReviewStatus =
                                        myVariantJSON.clinvar.rcv.review_status;
                                    entityClinicalSignificance.Update = Date.now;

                                    daoClinicalSignificance.update(entityClinicalSignificance);
                                });

                            } else {
                                let entityClinicalSignificance = {};

                                entityClinicalSignificance.VariantId = entityVariant.Id;
                                switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                    case "Pathogenic":
                                        entityClinicalSignificance.Significance = 1;
                                        break;
                                    case "Likely pathogenic":
                                        entityClinicalSignificance.Significance = 2;
                                        break;
                                    case "Uncertain":
                                        entityClinicalSignificance.Significance = 3;
                                        break;
                                    case "Likely bening":
                                        entityClinicalSignificance.Significance = 4;
                                        break;
                                    case "Bening":
                                        entityClinicalSignificance.Significance = 5;
                                        break;
                                    default:
                                        entityClinicalSignificance.Significance = null;
                                }

                                entityClinicalSignificance.Evaluated =
                                    myVariantJSON.clinvar.rcv.last_evaluated;
                                entityClinicalSignificance.ReviewStatus =
                                    myVariantJSON.clinvar.rcv.review_status;
                                entityClinicalSignificance.Update = Date.now;

                                daoClinicalSignificance.update(entityClinicalSignificance);
                            }
                        }
                    });
                } else {
                    //if rcv is a single entity
                    var statement =
                        "SELECT PATHOLOGY_ID FROM GENETYLLIS_PATHOLOGY WHERE PATHOLOGY_CUI = ?";
                    var resultset = query.execute(
                        statement,
                        [myVariantJSON.clinvar.rcv.conditions.identifiers.medgen],
                        "local",
                        "DefaultDB"
                    );

                    resultset.forEach((clinsig) => {
                        entityClinicalSignificance.VariantId = entityVariant.Id;
                        entityClinicalSignificance.PathologyId = clinsig.PATHOLOGY_ID;
                        switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                            case "Pathogenic":
                                entityClinicalSignificance.Significance = 1;
                                break;
                            case "Likely pathogenic":
                                entityClinicalSignificance.Significance = 2;
                                break;
                            case "Uncertain":
                                entityClinicalSignificance.Significance = 3;
                                break;
                            case "Likely bening":
                                entityClinicalSignificance.Significance = 4;
                                break;
                            case "Bening":
                                entityClinicalSignificance.Significance = 5;
                                break;
                            default:
                                entityClinicalSignificance.Significance = null;
                        }

                        entityClinicalSignificance.Evaluated =
                            myVariantJSON.clinvar.rcv.last_evaluated;
                        entityClinicalSignificance.ReviewStatus =
                            myVariantJSON.clinvar.rcv.review_status;
                        entityClinicalSignificance.Update = Date.now;

                        daoClinicalSignificance.update(entityClinicalSignificance);
                    });
                }
            } else {
                console.log("CLINSIG create");

                var rcvArray = myVariantJSON.clinvar.rcv;

                if (rcvArray.length !== undefined) {
                    rcvArray.forEach((rcv) => {
                        // console.log("rcv array");
                        // console.log(JSON.stringify(rcv));

                        var conditionsArray = rcv.conditions;
                        if (conditionsArray.length !== undefined) {
                            conditionsArray.forEach((conditions) => {
                                if (conditions.identifiers !== undefined) {
                                    console.log("multiple conditions with identifiers");
                                    var statement =
                                        "SELECT PATHOLOGY_ID FROM GENETYLLIS_PATHOLOGY WHERE PATHOLOGY_CUI = ?";
                                    var resultset = query.execute(
                                        statement,
                                        [conditions.identifiers.medgen],
                                        "local",
                                        "DefaultDB"
                                    );

                                    resultset.forEach((clinsig) => {
                                        let entityClinicalSignificance = {};
                                        entityClinicalSignificance.VariantId = entityVariant.Id;
                                        entityClinicalSignificance.PathologyId = clinsig.PATHOLOGY_ID;
                                        switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                            case "Pathogenic":
                                                entityClinicalSignificance.Significance = 1;
                                                break;
                                            case "Likely pathogenic":
                                                entityClinicalSignificance.Significance = 2;
                                                break;
                                            case "Uncertain":
                                                entityClinicalSignificance.Significance = 3;
                                                break;
                                            case "Likely bening":
                                                entityClinicalSignificance.Significance = 4;
                                                break;
                                            case "Bening":
                                                entityClinicalSignificance.Significance = 5;
                                                break;
                                            default:
                                                entityClinicalSignificance.Significance = null;
                                        }

                                        entityClinicalSignificance.Evaluated =
                                            myVariantJSON.clinvar.rcv.last_evaluated;
                                        entityClinicalSignificance.ReviewStatus =
                                            myVariantJSON.clinvar.rcv.review_status;
                                        entityClinicalSignificance.Update = Date.now;

                                        daoClinicalSignificance.create(entityClinicalSignificance);
                                    });

                                } else {
                                    console.log("multiple conditions without identifiers");

                                    let entityClinicalSignificance = {};

                                    entityClinicalSignificance.VariantId = entityVariant.Id;
                                    switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                        case "Pathogenic":
                                            entityClinicalSignificance.Significance = 1;
                                            break;
                                        case "Likely pathogenic":
                                            entityClinicalSignificance.Significance = 2;
                                            break;
                                        case "Uncertain":
                                            entityClinicalSignificance.Significance = 3;
                                            break;
                                        case "Likely bening":
                                            entityClinicalSignificance.Significance = 4;
                                            break;
                                        case "Bening":
                                            entityClinicalSignificance.Significance = 5;
                                            break;
                                        default:
                                            entityClinicalSignificance.Significance = null;
                                    }

                                    entityClinicalSignificance.Evaluated =
                                        myVariantJSON.clinvar.rcv.last_evaluated;
                                    entityClinicalSignificance.ReviewStatus =
                                        myVariantJSON.clinvar.rcv.review_status;
                                    entityClinicalSignificance.Update = Date.now;

                                    daoClinicalSignificance.create(entityClinicalSignificance);
                                }
                            });
                        } else {
                            if (rcv.conditions.identifiers !== undefined) {
                                var statement =
                                    "SELECT PATHOLOGY_ID FROM GENETYLLIS_PATHOLOGY WHERE PATHOLOGY_CUI = ?";
                                var resultset = query.execute(
                                    statement,
                                    [rcv.conditions.identifiers.medgen],
                                    "local",
                                    "DefaultDB"
                                );

                                resultset.forEach((clinsig) => {
                                    let entityClinicalSignificance = {};
                                    entityClinicalSignificance.VariantId = entityVariant.Id;
                                    entityClinicalSignificance.PathologyId = clinsig.PATHOLOGY_ID;
                                    switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                        case "Pathogenic":
                                            entityClinicalSignificance.Significance = 1;
                                            break;
                                        case "Likely pathogenic":
                                            entityClinicalSignificance.Significance = 2;
                                            break;
                                        case "Uncertain":
                                            entityClinicalSignificance.Significance = 3;
                                            break;
                                        case "Likely bening":
                                            entityClinicalSignificance.Significance = 4;
                                            break;
                                        case "Bening":
                                            entityClinicalSignificance.Significance = 5;
                                            break;
                                        default:
                                            entityClinicalSignificance.Significance = null;
                                    }

                                    entityClinicalSignificance.Evaluated =
                                        myVariantJSON.clinvar.rcv.last_evaluated;
                                    entityClinicalSignificance.ReviewStatus =
                                        myVariantJSON.clinvar.rcv.review_status;
                                    entityClinicalSignificance.Update = Date.now;

                                    daoClinicalSignificance.create(entityClinicalSignificance);
                                });

                            } else {
                                let entityClinicalSignificance = {};

                                entityClinicalSignificance.VariantId = entityVariant.Id;
                                switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                                    case "Pathogenic":
                                        entityClinicalSignificance.Significance = 1;
                                        break;
                                    case "Likely pathogenic":
                                        entityClinicalSignificance.Significance = 2;
                                        break;
                                    case "Uncertain":
                                        entityClinicalSignificance.Significance = 3;
                                        break;
                                    case "Likely bening":
                                        entityClinicalSignificance.Significance = 4;
                                        break;
                                    case "Bening":
                                        entityClinicalSignificance.Significance = 5;
                                        break;
                                    default:
                                        entityClinicalSignificance.Significance = null;
                                }

                                entityClinicalSignificance.Evaluated =
                                    myVariantJSON.clinvar.rcv.last_evaluated;
                                entityClinicalSignificance.ReviewStatus =
                                    myVariantJSON.clinvar.rcv.review_status;
                                entityClinicalSignificance.Update = Date.now;

                                daoClinicalSignificance.create(entityClinicalSignificance);
                            }
                        }
                    });
                } else {
                    //if rcv is a single entity
                    var statement =
                        "SELECT PATHOLOGY_ID FROM GENETYLLIS_PATHOLOGY WHERE PATHOLOGY_CUI = ?";
                    var resultset = query.execute(
                        statement,
                        [myVariantJSON.clinvar.rcv.conditions.identifiers.medgen],
                        "local",
                        "DefaultDB"
                    );

                    resultset.forEach((clinsig) => {
                        let entityClinicalSignificance = {};
                        entityClinicalSignificance.VariantId = entityVariant.Id;
                        entityClinicalSignificance.PathologyId = clinsig.PATHOLOGY_ID;
                        switch (myVariantJSON.clinvar.rcv.clinical_significance) {
                            case "Pathogenic":
                                entityClinicalSignificance.Significance = 1;
                                break;
                            case "Likely pathogenic":
                                entityClinicalSignificance.Significance = 2;
                                break;
                            case "Uncertain":
                                entityClinicalSignificance.Significance = 3;
                                break;
                            case "Likely bening":
                                entityClinicalSignificance.Significance = 4;
                                break;
                            case "Bening":
                                entityClinicalSignificance.Significance = 5;
                                break;
                            default:
                                entityClinicalSignificance.Significance = null;
                        }

                        entityClinicalSignificance.Evaluated =
                            myVariantJSON.clinvar.rcv.last_evaluated;
                        entityClinicalSignificance.ReviewStatus =
                            myVariantJSON.clinvar.rcv.review_status;
                        entityClinicalSignificance.Update = Date.now;

                        daoClinicalSignificance.create(entityClinicalSignificance);
                    });
                }
            }
        }

        //ALLELE FREQUENCY
        console.log("ALLELE FREQ");
        let entityAlleleFrequency = {};

        var statement = "SELECT * FROM GENETYLLIS_ALLELEFREQUENCY WHERE ALLELEFREQUENCY_VARIANTID = ?";
        var resultset = query.execute(statement, [entityVariant.Id], "local", "DefaultDB");

        if (resultset[0] !== undefined) {
            entityAlleleFrequency.Id = resultset[0].ALLELEFREQUENCY_VARIANTID;
            entityAlleleFrequency.VariantId = entityVariant.Id;

            var statement = "SELECT PATIENT_GENDERID FROM GENETYLLIS_PATIENT WHERE PATIENT_ID = ?";
            var resultset = query.execute(statement, [patientId], "local", "DefaultDB");

            entityAlleleFrequency.GenderId = resultset.PATIENT_GENDERID;
            entityAlleleFrequency.Update = Date.now;

            if (myVariantJSON.gnomad_genome !== undefined) {
                if (myVariantJSON.gnomad_genome.af.af !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af;
                    daoAlleleFreqeuncy.update(entityAlleleFrequency);
                }

                if (myVariantJSON.gnomad_genome.af.af_nfe_bgr !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af_nfe_bgr;
                    daoAlleleFreqeuncy.update(entityAlleleFrequency);
                }

                if (myVariantJSON.gnomad_genome.af.af_nfe_male !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af_nfe_male;
                    daoAlleleFreqeuncy.update(entityAlleleFrequency);
                }

                if (myVariantJSON.gnomad_genome.af.af_nfe_female !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af_nfe_female;
                    daoAlleleFreqeuncy.update(entityAlleleFrequency);
                }
            }
        } else {
            console.log("ALLELE FREQ create");
            let entityAlleleFrequency = {};
            entityAlleleFrequency.VariantId = entityVariant.Id;

            var statement = "SELECT PATIENT_GENDERID FROM GENETYLLIS_PATIENT WHERE PATIENT_ID = ?";
            var resultset = query.execute(statement, [patientId], "local", "DefaultDB");

            entityAlleleFrequency.GenderId = resultset[0].PATIENT_GENDERID;

            entityAlleleFrequency.Update = Date.now;

            if (myVariantJSON.gnomad_genome !== undefined) {
                if (myVariantJSON.gnomad_genome.af.af !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af;
                    daoAlleleFreqeuncy.create(entityAlleleFrequency);
                }

                if (myVariantJSON.gnomad_genome.af.af_nfe_bgr !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af_nfe_bgr;
                    daoAlleleFreqeuncy.create(entityAlleleFrequency);
                }

                if (myVariantJSON.gnomad_genome.af.af_nfe_male !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af_nfe_male;
                    daoAlleleFreqeuncy.create(entityAlleleFrequency);
                }

                if (myVariantJSON.gnomad_genome.af.af_nfe_female !== undefined) {
                    entityAlleleFrequency.PopulationId = 12;
                    entityAlleleFrequency.Frequency = myVariantJSON.gnomad_genome.af.af_nfe_female;
                    daoAlleleFreqeuncy.create(entityAlleleFrequency);
                }
            }
        }
    }
}