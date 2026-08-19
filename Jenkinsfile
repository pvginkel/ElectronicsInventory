import org.jenkinsci.plugins.pipeline.modeldefinition.Utils

library identifier: 'JenkinsPipelineUtils', changelog: false

// Single pipeline for the monorepo: validate the working tree, then build the
// images from it, then deploy. No DTAP — images are tagged with the build
// number and `latest`. Validation runs before the build, so `latest` is tagged
// at build time and there is no separate promote stage.

podTemplate(inheritFrom: 'jenkins-agent kaniko', containers: [
    containerTemplates.k8s('k8s')
]) {
    node(POD_LABEL) {
        def gitRev
        def k8sNamespace = kubectl.currentNamespace()

        stage('Cloning repo') {
            def scmVars = checkout scm

            gitRev = scmVars.GIT_COMMIT
        }

        stage('Run validation') {
            container('k8s') {
                // Resolve the Playwright version from the frontend lockfile to
                // select the matching base image (browsers pre-baked).
                def playwrightVersion = sh(
                    script: "grep -m1 '^  playwright@' frontend/pnpm-lock.yaml | sed 's/.*@//;s/://'",
                    returnStdout: true,
                ).trim()
                def validationImage = "registry:5000/modern-app-dev-playwright:playwright-${playwrightVersion}"
                echo "Validation image: ${validationImage}"

                // Stream the whole working tree in instead of baking it into an image.
                sh "tar czf /tmp/context.tar.gz --exclude=.git --exclude=node_modules --exclude=.venv --exclude=test-results --exclude=.pnpm-store ."

                withVault([vaultSecrets: [
                    [path: 'kv/shared/ceph-rgw/s3', engineVersion: 2, secretValues: [
                        [envVar: 'S3_ACCESS_KEY_ID', vaultKey: 'access_key_id'],
                        [envVar: 'S3_SECRET_ACCESS_KEY', vaultKey: 'secret_access_key'],
                    ]],
                ]]) {
                    def suites = ['backend', 'frontend']
                    def jobName = "electronics-inventory-validation-${BUILD_NUMBER}"

                    try {
                        kubectl.startJob("""\
                            apiVersion: batch/v1
                            kind: Job
                            metadata:
                                name: ${jobName}
                                namespace: ${k8sNamespace}
                                labels:
                                    app.kubernetes.io/name: electronics-inventory-validation
                                    app.kubernetes.io/managed-by: jenkins
                                    jenkins/build-number: "${BUILD_NUMBER}"
                            spec:
                                backoffLimit: 0
                                activeDeadlineSeconds: 3600
                                ttlSecondsAfterFinished: 3600
                                template:
                                    spec:
                                        restartPolicy: Never
                                        tolerations:
                                            - key: size
                                              operator: Equal
                                              value: large
                                              effect: PreferNoSchedule
                                        containers:
                                            - name: validation
                                              image: ${validationImage}
                                              imagePullPolicy: Always
                                              securityContext:
                                                  runAsUser: 1000
                                                  runAsGroup: 1000
                                              command: ["sh", "-c"]
                                              args:
                                                  - |
                                                    mkdir -p /work/staging /work/results
                                                    echo "Waiting for code upload..."
                                                    while [ ! -f /work/staging/ready ]; do sleep 1; done
                                                    echo "Code received, extracting..."
                                                    tar xzf /work/staging/context.tar.gz -C /work
                                                    rm -rf /work/staging
                                                    cd /work && poetry install --no-interaction
                                                    poetry run run-suite --output-mode full --junitxml-dir /work/results --retries 2
                                                    echo \$? > /work/results/exit-code
                                                    sleep infinity
                                              resources:
                                                  requests:
                                                      cpu: "1"
                                                      memory: 3584Mi
                                              env:
                                                  - name: S3_ENDPOINT_URL
                                                    value: "${S3_ENDPOINT_URL}"
                                                  - name: S3_ACCESS_KEY_ID
                                                    value: "${S3_ACCESS_KEY_ID}"
                                                  - name: S3_SECRET_ACCESS_KEY
                                                    value: "${S3_SECRET_ACCESS_KEY}"
                                                  - name: S3_BUCKET_NAME
                                                    value: "electronics-inventory-validation"
                        """.stripIndent())

                        def podName = kubectl.getJobPodName(jobName, k8sNamespace)
                        kubectl.waitForContainer(podName, 'validation', k8sNamespace)
                        sh "kubectl cp -n ${k8sNamespace} -c validation /tmp/context.tar.gz ${podName}:/work/staging/context.tar.gz"
                        sh "kubectl exec -n ${k8sNamespace} -c validation ${podName} -- touch /work/staging/ready"

                        // The container stays alive (sleep infinity) after running,
                        // so we wait for the exit-code file and then copy results
                        // out while it's still running.
                        kubectl.waitForFile(podName, 'validation', k8sNamespace, '/work/results/exit-code')

                        kubectl.savePodLogs(podName, 'validation', k8sNamespace, 'validation-raw.log')
                        utils.cleanLog('validation-raw.log', 'validation.log')

                        sh 'mkdir -p test-results'
                        sh "kubectl cp -n ${k8sNamespace} -c validation ${podName}:/work/results/. test-results/"

                        def exitCode = fileExists('test-results/exit-code') ? readFile('test-results/exit-code').trim() : ''

                        // Generate summary from SUITE_RESULT markers in the log.
                        // run-suite emits one marker per JUnit XML; the file stem is
                        // the suite name (backend, frontend).
                        def log = readFile('validation.log')
                        def resultLines = log.split('\n').findAll { it.startsWith('===SUITE_RESULT:') }
                        def summaryLines = []
                        def totalP = 0, totalF = 0, totalS = 0

                        suites.each { suite ->
                            def suiteLines = resultLines.findAll { line ->
                                def name = line.replace('===SUITE_RESULT:', '').split(':')[0]
                                name == suite || name.startsWith("${suite}-")
                            }
                            if (suiteLines) {
                                def p = 0, f = 0, s = 0
                                suiteLines.each { line ->
                                    def parts = line.replace('===SUITE_RESULT:', '').replace('===', '').split(':')
                                    p += parts[1] as int; f += parts[2] as int; s += parts[3] as int
                                }
                                totalP += p; totalF += f; totalS += s
                                summaryLines << String.format('  %-12s %3d passed  %3d failed  %3d skipped', suite, p, f, s)
                            } else {
                                summaryLines << String.format('  %-12s status unknown (no test results produced)', suite)
                            }
                        }

                        def summary = [
                            '',
                            '============================================',
                            '  TEST SUMMARY',
                            '============================================',
                            *summaryLines,
                            '--------------------------------------------',
                            String.format('  %-12s %3d passed  %3d failed  %3d skipped', 'TOTAL', totalP, totalF, totalS),
                            '============================================',
                        ].join('\n')
                        writeFile file: 'validation-summary.log', text: summary + '\n'

                        // Clean up intermediate files.
                        sh 'rm -f validation-raw.log /tmp/context.tar.gz test-results/exit-code'

                        archiveArtifacts artifacts: 'validation*.log, test-results/*.xml', allowEmptyArchive: true
                        junit testResults: 'test-results/*.xml', allowEmptyResults: true

                        currentBuild.description = "exit=${exitCode ?: 'n/a'}, ${totalP} passed, ${totalF} failed, ${totalS} skipped"

                        if (!exitCode) {
                            def failReason = kubectl.getJobFailReason(jobName, k8sNamespace)
                            def msg = "Validation failed: no exit code recorded"
                            if (failReason) {
                                msg += " (job: ${failReason})"
                            }
                            error(msg)
                        } else if (exitCode != '0') {
                            error("Validation failed: exit code ${exitCode}")
                        }
                    } finally {
                        kubectl.deleteJob(jobName, k8sNamespace)
                    }
                }
            }
        }

        stage('Building electronics-inventory') {
            container('kaniko') {
                helmCharts.kaniko("backend/Dockerfile", "backend", [
                    "registry:5000/electronics-inventory:${currentBuild.number}",
                    "registry:5000/electronics-inventory:latest"
                ])
            }
        }

        stage('Building electronics-inventory-ui') {
            writeFile file: 'frontend/git-rev', text: gitRev

            container('kaniko') {
                helmCharts.kaniko("frontend/Dockerfile", "frontend", [
                    "registry:5000/electronics-inventory-ui:${currentBuild.number}",
                    "registry:5000/electronics-inventory-ui:latest"
                ])
            }
        }

        stage('Building electronics-inventory contributor documentation') {
            container('kaniko') {
                helmCharts.kaniko("frontend/Dockerfile.docs", "frontend", [
                    "registry:5000/electronics-inventory-docs:${currentBuild.number}",
                    "registry:5000/electronics-inventory-docs:latest"
                ])
            }
        }

        stage('Deploy Helm charts') {
            cicd.helmDeploy()
        }
    }
}
