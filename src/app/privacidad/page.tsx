import Link from "next/link";
import { PaginaLegal, Seccion } from "@/components/legal";
import { RESPONSABLE } from "@/lib/legal";

export const metadata = {
  title: "Política de privacidad",
  description: "Cómo Repastos trata los datos personales y los datos de tu ganadería.",
};

export default function Privacidad() {
  const r = RESPONSABLE;
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      resumen="En pocas palabras: usamos tus datos solo para darte el servicio. No los vendemos ni los usamos para publicidad. Cada ganadería solo ve sus propios datos. Puedes ver, corregir, exportar y eliminar tu información, y nos puedes escribir para ejercer tus derechos según la Ley N.º 8968."
    >
      <Seccion n={1} titulo="Responsable">
        <p>
          El responsable de la base de datos es {r.razonSocial}, cédula {r.cedula}, con domicilio en {r.domicilio}. Para
          cualquier asunto de privacidad escribe a {r.correoPrivacidad}. Esta política cumple la Ley de Protección de la
          Persona frente al Tratamiento de sus Datos Personales (Ley N.º 8968) y su reglamento.
        </p>
      </Seccion>

      <Seccion n={2} titulo="Qué datos recopilamos">
        <ul>
          <li>
            <b>Cuenta:</b> nombre, correo electrónico y contraseña. La contraseña la gestiona nuestro proveedor de
            autenticación y se guarda cifrada mediante una función de hash; nadie en Repastos puede verla.
          </li>
          <li>
            <b>Equipo:</b> el correo y el rol de cada persona que pertenece a una ganadería.
          </li>
          <li>
            <b>Datos de la ganadería:</b> nombre, fincas (provincia, cantón, altitud), límites de potreros y áreas en el mapa,
            lotes de ganado, movimientos, aforos, lluvia, productos y aplicaciones, análisis de suelo, plagas, producción de
            leche, pesajes, labores y los archivos que subas. Los límites dibujados en el mapa revelan la ubicación de la finca.
          </li>
          <li>
            <b>Datos técnicos:</b> dirección IP, tipo de navegador y registros de acceso y de errores, necesarios para la
            seguridad y el funcionamiento.
          </li>
          <li>
            <b>Pagos:</b> cuando se contrata un plan, la pasarela de pago procesa los datos de la tarjeta. Nosotros solo
            recibimos el estado del pago, el plan y un identificador del cliente; no almacenamos el número completo de la tarjeta.
          </li>
        </ul>
        <p>No recopilamos datos sensibles (salud, origen étnico, religión, orientación sexual, etc.) y te pedimos no ingresarlos en notas ni archivos.</p>
      </Seccion>

      <Seccion n={3} titulo="Para qué los usamos">
        <ul>
          <li>Prestar el Servicio: mostrar el mapa, calcular áreas, estados, tiempos de espera, estimaciones y reportes.</li>
          <li>Administrar tu cuenta, tu equipo, la membresía y la facturación.</li>
          <li>Proteger el Servicio: prevenir accesos no autorizados, fraude y abuso, y diagnosticar errores.</li>
          <li>Comunicarnos contigo sobre el Servicio (avisos de seguridad, cambios, cobros). Solo te enviaremos publicidad si lo autorizas, y podrás retirar esa autorización.</li>
          <li>Cumplir obligaciones legales y tributarias.</li>
        </ul>
        <p>
          El tratamiento se basa en tu consentimiento libre, expreso e informado, que otorgas al aceptar esta política al
          crear tu ganadería, y en la necesidad de ejecutar el contrato del Servicio. Puedes revocar el consentimiento en
          cualquier momento; si lo haces, no podremos seguir prestándote el Servicio.
        </p>
      </Seccion>

      <Seccion n={4} titulo="Con quién los compartimos">
        <p>No vendemos, alquilamos ni cedemos tus datos. Solo los comparten:</p>
        <ul>
          <li><b>Tu propio equipo:</b> las personas que el propietario o un administrador agregan a la ganadería, según su rol.</li>
          <li>
            <b>Proveedores que nos prestan servicios (encargados),</b> que solo pueden usar los datos para ese fin y bajo
            obligaciones de confidencialidad y seguridad:
            <ul>
              <li>Neon (base de datos, autenticación y almacenamiento de archivos).</li>
              <li>Cloudflare (alojamiento de la aplicación y protección de la red).</li>
              <li>Esri / ArcGIS (imágenes satelitales del mapa): tu navegador descarga las teselas directamente, por lo que el proveedor recibe tu IP y la zona del mapa que ves.</li>
              <li>Open-Meteo (altitud): solo si usas «Calcular altitud», enviamos las coordenadas del centro de cada potrero, sin nombres ni datos de la cuenta.</li>
              <li>La pasarela de pago que procese las membresías.</li>
            </ul>
          </li>
          <li><b>Autoridades:</b> cuando lo exija una ley o una orden de autoridad competente.</li>
          <li><b>Por decisión tuya:</b> por ejemplo, al compartir un reporte por WhatsApp.</li>
        </ul>
      </Seccion>

      <Seccion n={5} titulo="Transferencia internacional">
        <p>
          Algunos proveedores alojan los datos en servidores fuera de Costa Rica (por ejemplo, en Estados Unidos). Al aceptar
          esta política autorizas esa transferencia, que se hace con proveedores que ofrecen garantías adecuadas de seguridad
          y confidencialidad.
        </p>
      </Seccion>

      <Seccion n={6} titulo="Cuánto tiempo los conservamos">
        <ul>
          <li>Mientras tu cuenta o tu ganadería estén activas.</li>
          <li>
            Si el propietario elimina la ganadería, sus datos y archivos se borran de inmediato de la base de datos y del
            almacenamiento; pueden permanecer en copias de seguridad cifradas hasta 30 días, tras lo cual se eliminan.
          </li>
          <li>Los registros de facturación se conservan durante el plazo que exija la legislación tributaria.</li>
          <li>Los registros técnicos de acceso y errores se conservan por un período limitado, solo para seguridad.</li>
        </ul>
      </Seccion>

      <Seccion n={7} titulo="Cómo protegemos los datos">
        <ul>
          <li>Conexión cifrada (HTTPS con HSTS) en todo el Servicio.</li>
          <li>Aislamiento por ganadería: cada consulta se filtra por la ganadería y se verifica la membresía y el rol del usuario en cada acción.</li>
          <li>Roles con permisos mínimos (propietario, administrador, operador, lector).</li>
          <li>Validación en el servidor de todo dato que ingresa y consultas parametrizadas a la base de datos.</li>
          <li>Archivos en almacenamiento privado, entregados solo a miembros mediante enlaces temporales de corta duración.</li>
          <li>Cabeceras de seguridad del navegador (política de contenido, protección contra incrustación en otros sitios).</li>
        </ul>
        <p>
          Ningún sistema es infalible. Si ocurre un incidente de seguridad que afecte tus datos, te lo comunicaremos sin
          demora indebida junto con las medidas tomadas, y lo notificaremos a la Agencia de Protección de Datos de los
          Habitantes (PRODHAB) cuando corresponda.
        </p>
      </Seccion>

      <Seccion n={8} titulo="Tus derechos">
        <p>Según la Ley N.º 8968 tienes derecho a:</p>
        <ul>
          <li><b>Acceso:</b> saber qué datos tuyos tratamos. El propietario o un administrador puede descargar todos los datos de la ganadería (en formato JSON) desde Ajustes.</li>
          <li><b>Rectificación:</b> corregir datos inexactos, directamente en la aplicación o escribiéndonos.</li>
          <li>
            <b>Supresión:</b> el propietario puede eliminar la ganadería y todos sus datos desde Ajustes; cualquier miembro
            puede salir de una ganadería. Para eliminar tu cuenta de usuario, escríbenos.
          </li>
          <li><b>Oposición y revocación</b> del consentimiento para fines que no sean necesarios para el Servicio.</li>
        </ul>
        <p>
          Para ejercerlos escribe a {r.correoPrivacidad} desde el correo de tu cuenta. Responderemos dentro de los plazos
          que establece la ley (cinco días hábiles para solicitudes de acceso). Si no quedas satisfecho, puedes acudir a la
          PRODHAB.
        </p>
      </Seccion>

      <Seccion n={9} titulo="Cookies y almacenamiento en tu dispositivo">
        <p>
          Usamos únicamente cookies necesarias para mantener tu sesión iniciada de forma segura. No usamos cookies de
          publicidad ni de rastreo de terceros. En tu navegador guardamos tu preferencia de apariencia (claro u oscuro) y,
          en el registro de campo, la cola de datos anotados sin señal hasta que se envían.
        </p>
      </Seccion>

      <Seccion n={10} titulo="Menores de edad">
        <p>El Servicio está dirigido a mayores de 18 años. No recopilamos a sabiendas datos de menores.</p>
      </Seccion>

      <Seccion n={11} titulo="Cambios a esta política">
        <p>
          Si cambiamos esta política de forma relevante, te lo avisaremos en la aplicación o por correo antes de que entre en
          vigor y, cuando la ley lo exija, te pediremos de nuevo tu consentimiento. Consulta también los{" "}
          <Link href="/terminos">Términos y condiciones</Link>.
        </p>
      </Seccion>

      <Seccion n={12} titulo="Contacto">
        <p>{r.razonSocial} · {r.domicilio} · {r.correoPrivacidad}</p>
      </Seccion>
    </PaginaLegal>
  );
}
