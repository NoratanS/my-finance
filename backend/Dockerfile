# Build stage: compile the Spring Boot fat jar with the repo's Maven wrapper.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build

# Copy only the build definition first so the dependency download layer is
# cached until pom.xml changes — source edits then rebuild in seconds.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw --batch-mode --quiet dependency:go-offline

COPY src/ src/
RUN ./mvnw --batch-mode --quiet -DskipTests package

# Runtime stage: slim JRE only, no build tools. The alpine base ships busybox
# wget, which docker-compose.yml uses for the /actuator/health healthcheck.
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
